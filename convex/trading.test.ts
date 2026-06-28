import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  makerWindowOpen,
  takerWindowOpen,
  makerDefaultDue,
  forcedLongDue,
  MAKER_LEAD_MS,
} from "./lib/trading";
import { teamSupremacy, tradePnl } from "./lib/game";
import { roundedBalances, minimalTransfers } from "./lib/ledger";
import { STAKES, STAGES } from "../src/config/constants";

const modules = import.meta.glob("./**/*.ts");

const HOUR = 60 * 60 * 1000;
const now = () => Date.now();
const koOpen = () => now() + 3 * HOUR;
const koMakerClosed = () => now() + 30 * 60 * 1000;
const koPast = () => now() - 60 * 1000;

type T = ReturnType<typeof convexTest>;

async function addLeague(t: T, ownerUserId?: Id<"users">) {
  return await t.run((ctx) =>
    ctx.db.insert("leagues", {
      name: "Test",
      tournament: "WC2026",
      width: 0.2,
      stakes: STAGES.map((stage) => ({ stage, amount: STAKES[stage] })),
      settlementBasis: "120min_exclPens",
      ownerUserId,
      inviteCode: "TESTTEST",
    }),
  );
}

async function addUser(t: T, email: string, isAdmin = false) {
  return await t.run((ctx) => ctx.db.insert("users", { email, isAdmin }));
}

/** Add a player to a league; if claim, create+claim a user and return their id. */
async function addPlayer(t: T, leagueId: Id<"leagues">, name: string, claim = true) {
  return await t.run(async (ctx) => {
    if (!claim) {
      await ctx.db.insert("players", { leagueId, name });
      return null;
    }
    const userId = await ctx.db.insert("users", { email: `${name}@t.co` });
    await ctx.db.insert("players", { leagueId, name, claimedByUserId: userId });
    return userId;
  });
}

function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session` });
}

async function addGame(
  t: T,
  leagueId: Id<"leagues">,
  opts: {
    maker: string;
    koUtc?: number;
    bid?: number;
    quoteTeam?: "HOME" | "AWAY";
    stage?: "R32" | "R16" | "QF" | "SF" | "3PO" | "F";
    status?: "SCHEDULED" | "LIVE" | "FT" | "SETTLED" | "VOID";
  },
) {
  return await t.run((ctx) =>
    ctx.db.insert("games", {
      leagueId,
      gameNo: 1,
      stage: opts.stage ?? "R32",
      status: opts.status ?? "SCHEDULED",
      makerPlayer: opts.maker,
      koUtc: opts.koUtc,
      ...(opts.bid !== undefined ? { bid: opts.bid } : {}),
      ...(opts.quoteTeam ? { quoteTeam: opts.quoteTeam } : {}),
    }),
  );
}

/* ── pure logic ───────────────────────────────────────────────────────── */

describe("windows", () => {
  const ko = 1_000_000_000_000;
  test("maker closes 60m before KO, taker at KO", () => {
    expect(makerWindowOpen(ko - MAKER_LEAD_MS - 1, ko)).toBe(true);
    expect(makerWindowOpen(ko - MAKER_LEAD_MS, ko)).toBe(false);
    expect(makerDefaultDue(ko - MAKER_LEAD_MS, ko)).toBe(true);
    expect(takerWindowOpen(ko - 1, ko)).toBe(true);
    expect(takerWindowOpen(ko, ko)).toBe(false);
    expect(forcedLongDue(ko, ko)).toBe(true);
  });
  test("unknown KO leaves windows open", () => {
    expect(makerWindowOpen(now(), null)).toBe(true);
    expect(takerWindowOpen(now(), undefined)).toBe(true);
  });
});

describe("settlement P&L (quote-team)", () => {
  test("sell the away favourite — worked example", () => {
    const s = teamSupremacy("AWAY", 0, 1);
    expect(s).toBe(1);
    expect(tradePnl("SELL", 1.3, s, 10)).toBeCloseTo(3);
  });
  test("home basics + shootout draw", () => {
    expect(tradePnl("BUY", 0.2, teamSupremacy("HOME", 3, 1), 10)).toBeCloseTo(18);
    expect(teamSupremacy("AWAY", 1, 1)).toBe(0);
  });
});

describe("ledger math", () => {
  test("rounding zero-sum + minimal transfers clear all", () => {
    const b = roundedBalances(new Map([["A", 5.4], ["B", -2.6], ["C", -2.8]]));
    expect(b.reduce((s, x) => s + x.net, 0)).toBe(0);
    const tr = minimalTransfers([
      { player: "A", net: 5 },
      { player: "B", net: -3 },
      { player: "C", net: -2 },
    ]);
    expect(tr.length).toBe(2);
  });
});

/* ── maker ────────────────────────────────────────────────────────────── */

describe("maker bid", () => {
  test("submit, amend until a trade, then locked", async () => {
    const t = convexTest(schema, modules);
    const lid = await addLeague(t);
    const yas = (await addPlayer(t, lid, "Yas"))!;
    const cp = (await addPlayer(t, lid, "CP"))!;
    const game = await addGame(t, lid, { maker: "Yas", koUtc: koOpen() });

    const r1 = await asUser(t, yas).mutation(api.trades.submitBid, { gameId: game, bid: 0.3 });
    expect(r1.offer).toBeCloseTo(0.5);
    const r2 = await asUser(t, yas).mutation(api.trades.submitBid, { gameId: game, bid: 0.1 });
    expect(r2.offer).toBeCloseTo(0.3);

    await asUser(t, cp).mutation(api.trades.submitTrade, { gameId: game, side: "BUY" });
    await expect(
      asUser(t, yas).mutation(api.trades.submitBid, { gameId: game, bid: 0.2 }),
    ).rejects.toThrow(/locked/i);
  });

  test("rejects after window + non-maker", async () => {
    const t = convexTest(schema, modules);
    const lid = await addLeague(t);
    const yas = (await addPlayer(t, lid, "Yas"))!;
    await addPlayer(t, lid, "Pascal", false);
    const late = await addGame(t, lid, { maker: "Yas", koUtc: koMakerClosed() });
    await expect(
      asUser(t, yas).mutation(api.trades.submitBid, { gameId: late, bid: 0.2 }),
    ).rejects.toThrow(/window has closed/i);

    const other = await addGame(t, lid, { maker: "Pascal", koUtc: koOpen() });
    await expect(
      asUser(t, yas).mutation(api.trades.submitBid, { gameId: other, bid: 0.2 }),
    ).rejects.toThrow(/not the maker/i);
  });

  test("maker can clear (untraded), not after a trade", async () => {
    const t = convexTest(schema, modules);
    const lid = await addLeague(t);
    const yas = (await addPlayer(t, lid, "Yas"))!;
    const cp = (await addPlayer(t, lid, "CP"))!;
    const game = await addGame(t, lid, { maker: "Yas", bid: 0.3, koUtc: koOpen() });
    await asUser(t, yas).mutation(api.trades.clearBid, { gameId: game });
    expect(await t.run((ctx) => ctx.db.get(game)).then((g) => g?.bid)).toBeUndefined();

    await asUser(t, yas).mutation(api.trades.submitBid, { gameId: game, bid: 0.3 });
    await asUser(t, cp).mutation(api.trades.submitTrade, { gameId: game, side: "BUY" });
    await expect(
      asUser(t, yas).mutation(api.trades.clearBid, { gameId: game }),
    ).rejects.toThrow(/already traded/i);
  });
});

/* ── taker ────────────────────────────────────────────────────────────── */

describe("taker", () => {
  test("BUY/SELL pricing + one-per-game + maker-can't-trade-own", async () => {
    const t = convexTest(schema, modules);
    const lid = await addLeague(t);
    await addPlayer(t, lid, "Pascal", false);
    const yas = (await addPlayer(t, lid, "Yas"))!;
    const cp = (await addPlayer(t, lid, "CP"))!;
    const game = await addGame(t, lid, { maker: "Pascal", bid: 0.2, koUtc: koOpen() });

    const buy = await asUser(t, yas).mutation(api.trades.submitTrade, { gameId: game, side: "BUY" });
    expect(buy.priceTaken).toBeCloseTo(0.4);
    expect(buy.stake).toBe(10);
    const sell = await asUser(t, cp).mutation(api.trades.submitTrade, { gameId: game, side: "SELL" });
    expect(sell.priceTaken).toBeCloseTo(0.2);
    await expect(
      asUser(t, yas).mutation(api.trades.submitTrade, { gameId: game, side: "SELL" }),
    ).rejects.toThrow(/already traded/i);

    const ownGame = await addGame(t, lid, { maker: "Yas", bid: 0.2, koUtc: koOpen() });
    await expect(
      asUser(t, yas).mutation(api.trades.submitTrade, { gameId: ownGame, side: "BUY" }),
    ).rejects.toThrow(/your own game/i);
  });

  test("rejects after KO + with no rate", async () => {
    const t = convexTest(schema, modules);
    const lid = await addLeague(t);
    await addPlayer(t, lid, "Pascal", false);
    const yas = (await addPlayer(t, lid, "Yas"))!;
    const closed = await addGame(t, lid, { maker: "Pascal", bid: 0.2, koUtc: koPast() });
    await expect(
      asUser(t, yas).mutation(api.trades.submitTrade, { gameId: closed, side: "BUY" }),
    ).rejects.toThrow(/closed/i);
    const norate = await addGame(t, lid, { maker: "Pascal", koUtc: koOpen() });
    await expect(
      asUser(t, yas).mutation(api.trades.submitTrade, { gameId: norate, side: "BUY" }),
    ).rejects.toThrow(/no rate/i);
  });
});

/* ── penalties / settlement / admin ───────────────────────────────────── */

describe("penalties", () => {
  test("default maker + forced longs at KO (scoped to league)", async () => {
    const t = convexTest(schema, modules);
    const lid = await addLeague(t);
    await addPlayer(t, lid, "Pascal", false);
    await addPlayer(t, lid, "Yas", false);
    await addPlayer(t, lid, "CP", false);
    const game = await addGame(t, lid, { maker: "Pascal", koUtc: koPast() });

    const r = await t.mutation(internal.trades.applyDeadlinePenalties, {});
    expect(r.defaults).toBe(1);
    expect(r.forced).toBe(2);
    const g = await t.run((ctx) => ctx.db.get(game));
    expect(g?.bid).toBe(0);
    expect(g?.defaultedMaker).toBe(true);
  });
});

describe("admin + settlement", () => {
  test("override re-prices, settle pays worked example, void excludes", async () => {
    const t = convexTest(schema, modules);
    const owner = await addUser(t, "owner@t.co", true);
    const lid = await addLeague(t, owner);
    await addPlayer(t, lid, "Pascal", false);
    await addPlayer(t, lid, "Yas", false);
    const game = await addGame(t, lid, { maker: "Pascal", koUtc: koPast() });

    await asUser(t, owner).mutation(api.admin.overrideMakerBid, {
      gameId: game,
      bid: 1.3,
      quoteTeam: "AWAY",
    });
    await asUser(t, owner).mutation(api.admin.overrideTrade, {
      gameId: game,
      player: "Yas",
      side: "SELL",
    });
    await asUser(t, owner).mutation(api.settlement.settleManual, {
      gameId: game,
      home: 0,
      away: 1,
    });

    const st = await t.query(api.standings.standings, { leagueId: lid });
    expect(st.rows.find((r) => r.player === "Yas")?.pnl).toBeCloseTo(3);
    expect(st.rows.find((r) => r.player === "Pascal")?.pnl).toBeCloseTo(-3);

    await asUser(t, owner).mutation(api.settlement.voidGame, { gameId: game });
    const st2 = await t.query(api.standings.standings, { leagueId: lid });
    expect(st2.settledCount).toBe(0);
  });

  test("non-owner rejected", async () => {
    const t = convexTest(schema, modules);
    const lid = await addLeague(t); // no owner
    const yas = (await addPlayer(t, lid, "Yas"))!;
    const game = await addGame(t, lid, { maker: "Pascal", koUtc: koPast() });
    await expect(
      asUser(t, yas).mutation(api.admin.overrideMakerBid, { gameId: game, bid: 0.2 }),
    ).rejects.toThrow(/owner/i);
  });
});
