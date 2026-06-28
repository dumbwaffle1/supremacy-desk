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

const modules = import.meta.glob("./**/*.ts");

const HOUR = 60 * 60 * 1000;
const now = () => Date.now();
const koOpen = () => now() + 3 * HOUR; // maker + taker open
const koMakerClosed = () => now() + 30 * 60 * 1000; // <60min: maker closed, taker open
const koPast = () => now() - 60 * 1000; // both closed

async function addPlayer(
  t: ReturnType<typeof convexTest>,
  name: string,
  claim = true,
) {
  return await t.run(async (ctx) => {
    if (!claim) return await ctx.db.insert("players", { name });
    const userId = await ctx.db.insert("users", { email: `${name}@t.co` });
    await ctx.db.insert("players", { name, claimedByUserId: userId });
    return userId;
  });
}

function asPlayer(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session` });
}

async function addGame(
  t: ReturnType<typeof convexTest>,
  opts: {
    maker: string;
    koUtc?: number;
    bid?: number;
    stage?: "R32" | "R16" | "QF" | "SF" | "3PO" | "F";
    status?: "SCHEDULED" | "LIVE" | "FT" | "SETTLED" | "VOID";
  },
) {
  return await t.run((ctx) =>
    ctx.db.insert("games", {
      gameNo: 1,
      stage: opts.stage ?? "R32",
      status: opts.status ?? "SCHEDULED",
      makerPlayer: opts.maker,
      koUtc: opts.koUtc,
      ...(opts.bid !== undefined ? { bid: opts.bid } : {}),
    }),
  );
}

describe("window pure logic (spec §7)", () => {
  const ko = 1_000_000_000_000;
  test("maker window closes 60 min before KO", () => {
    expect(makerWindowOpen(ko - MAKER_LEAD_MS - 1, ko)).toBe(true);
    expect(makerWindowOpen(ko - MAKER_LEAD_MS, ko)).toBe(false);
    expect(makerDefaultDue(ko - MAKER_LEAD_MS, ko)).toBe(true);
  });
  test("taker window closes at KO", () => {
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
    // Maker quoted Canada (away) 1.3/1.5; you SELL Canada @ 1.3.
    // Canada win 1–0 (home 0, away 1) → Canada supremacy = 1.
    const s = teamSupremacy("AWAY", 0, 1);
    expect(s).toBe(1);
    expect(tradePnl("SELL", 1.3, s, 10)).toBeCloseTo(3); // (1.3 − 1) × 10
  });

  test("home supremacy basics (spec §5 example)", () => {
    expect(tradePnl("BUY", 0.2, teamSupremacy("HOME", 3, 1), 10)).toBeCloseTo(18); // (2−0.2)×10
    expect(tradePnl("SELL", 0.0, teamSupremacy("HOME", 0, 1), 10)).toBeCloseTo(10); // (0−(−1))×10
  });

  test("a penalty shootout is a draw → supremacy 0", () => {
    expect(teamSupremacy("AWAY", 1, 1)).toBe(0);
    expect(tradePnl("BUY", 0.2, 0, 10)).toBeCloseTo(-2);
  });
});

describe("maker bid", () => {
  test("submits, offer = bid + 0.2, amendable until a trade, then locked", async () => {
    const t = convexTest(schema, modules);
    const yas = await addPlayer(t, "Yas");
    const cp = await addPlayer(t, "CP");
    const gameId = await addGame(t, { maker: "Yas", koUtc: koOpen() });

    const r1 = await asPlayer(t, yas).mutation(api.trades.submitBid, {
      gameId,
      bid: 0.3,
    });
    expect(r1.offer).toBeCloseTo(0.5);

    // Amend allowed while nobody has traded.
    const r2 = await asPlayer(t, yas).mutation(api.trades.submitBid, {
      gameId,
      bid: 0.1,
    });
    expect(r2.offer).toBeCloseTo(0.3);

    // Once a taker trades, the rate locks.
    await asPlayer(t, cp).mutation(api.trades.submitTrade, { gameId, side: "BUY" });
    await expect(
      asPlayer(t, yas).mutation(api.trades.submitBid, { gameId, bid: 0.2 }),
    ).rejects.toThrow(/locked/i);
  });

  test("supports negative / flat quotes", async () => {
    const t = convexTest(schema, modules);
    const yas = await addPlayer(t, "Yas");
    const gameId = await addGame(t, { maker: "Yas", koUtc: koOpen() });
    const r = await asPlayer(t, yas).mutation(api.trades.submitBid, {
      gameId,
      bid: -0.1,
    });
    expect(r.bid).toBeCloseTo(-0.1);
    expect(r.offer).toBeCloseTo(0.1); // −0.1 / 0.1 flat
  });

  test("rejects when maker window has closed", async () => {
    const t = convexTest(schema, modules);
    const yas = await addPlayer(t, "Yas");
    const gameId = await addGame(t, { maker: "Yas", koUtc: koMakerClosed() });
    await expect(
      asPlayer(t, yas).mutation(api.trades.submitBid, { gameId, bid: 0.2 }),
    ).rejects.toThrow(/window has closed/i);
  });

  test("rejects a non-maker", async () => {
    const t = convexTest(schema, modules);
    await addPlayer(t, "Pascal");
    const yas = await addPlayer(t, "Yas");
    const gameId = await addGame(t, { maker: "Pascal", koUtc: koOpen() });
    await expect(
      asPlayer(t, yas).mutation(api.trades.submitBid, { gameId, bid: 0.2 }),
    ).rejects.toThrow(/not the maker/i);
  });
});

describe("taker trade", () => {
  test("BUY lifts the offer, SELL hits the bid; stake from stage", async () => {
    const t = convexTest(schema, modules);
    await addPlayer(t, "Pascal");
    const yas = await addPlayer(t, "Yas");
    const cp = await addPlayer(t, "CP");
    const gameId = await addGame(t, { maker: "Pascal", bid: 0.2, koUtc: koOpen() });

    const buy = await asPlayer(t, yas).mutation(api.trades.submitTrade, {
      gameId,
      side: "BUY",
    });
    expect(buy.priceTaken).toBeCloseTo(0.4); // offer
    expect(buy.stake).toBe(10); // R32

    const sell = await asPlayer(t, cp).mutation(api.trades.submitTrade, {
      gameId,
      side: "SELL",
    });
    expect(sell.priceTaken).toBeCloseTo(0.2); // bid
  });

  test("one trade per game (locked)", async () => {
    const t = convexTest(schema, modules);
    await addPlayer(t, "Pascal");
    const yas = await addPlayer(t, "Yas");
    const gameId = await addGame(t, { maker: "Pascal", bid: 0.2, koUtc: koOpen() });
    await asPlayer(t, yas).mutation(api.trades.submitTrade, { gameId, side: "BUY" });
    await expect(
      asPlayer(t, yas).mutation(api.trades.submitTrade, { gameId, side: "SELL" }),
    ).rejects.toThrow(/already traded/i);
  });

  test("maker cannot trade their own game", async () => {
    const t = convexTest(schema, modules);
    const yas = await addPlayer(t, "Yas");
    const gameId = await addGame(t, { maker: "Yas", bid: 0.2, koUtc: koOpen() });
    await expect(
      asPlayer(t, yas).mutation(api.trades.submitTrade, { gameId, side: "BUY" }),
    ).rejects.toThrow(/your own game/i);
  });

  test("rejects after kick-off", async () => {
    const t = convexTest(schema, modules);
    await addPlayer(t, "Pascal");
    const yas = await addPlayer(t, "Yas");
    const gameId = await addGame(t, { maker: "Pascal", bid: 0.2, koUtc: koPast() });
    await expect(
      asPlayer(t, yas).mutation(api.trades.submitTrade, { gameId, side: "BUY" }),
    ).rejects.toThrow(/closed/i);
  });

  test("rejects with no rate yet", async () => {
    const t = convexTest(schema, modules);
    await addPlayer(t, "Pascal");
    const yas = await addPlayer(t, "Yas");
    const gameId = await addGame(t, { maker: "Pascal", koUtc: koOpen() });
    await expect(
      asPlayer(t, yas).mutation(api.trades.submitTrade, { gameId, side: "BUY" }),
    ).rejects.toThrow(/no rate/i);
  });
});

describe("deadline penalties (spec §7)", () => {
  test("defaults a missing maker rate and forces longs at KO", async () => {
    const t = convexTest(schema, modules);
    // roster: Pascal (maker), Yas, CP, Manas — none traded
    await addPlayer(t, "Pascal", false);
    await addPlayer(t, "Yas", false);
    await addPlayer(t, "CP", false);
    await addPlayer(t, "Manas", false);
    const gameId = await addGame(t, { maker: "Pascal", koUtc: koPast() });

    const r = await t.mutation(internal.trades.applyDeadlinePenalties, {});
    expect(r.defaults).toBe(1);
    expect(r.forced).toBe(3); // everyone except the maker

    const { game, trades } = await t.run(async (ctx) => ({
      game: await ctx.db.get(gameId),
      trades: await ctx.db
        .query("trades")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .collect(),
    }));
    expect(game?.bid).toBe(0);
    expect(game?.defaultedMaker).toBe(true);
    expect(trades).toHaveLength(3);
    for (const tr of trades) {
      expect(tr.side).toBe("BUY");
      expect(tr.forcedLong).toBe(true);
      expect(tr.priceTaken).toBeCloseTo(0.2); // offer = 0 + 0.2
    }
  });

  test("is idempotent — no duplicate forced longs", async () => {
    const t = convexTest(schema, modules);
    await addPlayer(t, "Pascal", false);
    await addPlayer(t, "Yas", false);
    const gameId = await addGame(t, { maker: "Pascal", koUtc: koPast() });

    await t.mutation(internal.trades.applyDeadlinePenalties, {});
    const second = await t.mutation(internal.trades.applyDeadlinePenalties, {});
    expect(second.defaults).toBe(0);
    expect(second.forced).toBe(0);

    const trades = await t.run((ctx) =>
      ctx.db
        .query("trades")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .collect(),
    );
    expect(trades).toHaveLength(1); // just Yas
  });
});

describe("admin override (past deadlines)", () => {
  async function addAdmin(t: ReturnType<typeof convexTest>) {
    return await t.run((ctx) =>
      ctx.db.insert("users", { email: "admin@t.co", isAdmin: true }),
    );
  }

  test("admin sets a maker rate on a past-KO game, with an audit row", async () => {
    const t = convexTest(schema, modules);
    const admin = await addAdmin(t);
    await addPlayer(t, "Pascal", false);
    const gameId = await addGame(t, { maker: "Pascal", koUtc: koPast() });

    const r = await asPlayer(t, admin).mutation(api.admin.overrideMakerBid, {
      gameId,
      bid: 0.3,
    });
    expect(r.offer).toBeCloseTo(0.5);

    const { game, audits } = await t.run(async (ctx) => ({
      game: await ctx.db.get(gameId),
      audits: await ctx.db.query("auditLogs").collect(),
    }));
    expect(game?.bid).toBe(0.3);
    expect(audits.some((a) => a.action === "admin_override_bid")).toBe(true);
  });

  test("admin can add a trade for a player who hasn't logged in", async () => {
    const t = convexTest(schema, modules);
    const admin = await addAdmin(t);
    await addPlayer(t, "Pascal", false);
    await addPlayer(t, "Manas", false); // never logged in
    const gameId = await addGame(t, { maker: "Pascal", bid: 0.2, koUtc: koPast() });

    await asPlayer(t, admin).mutation(api.admin.overrideTrade, {
      gameId,
      player: "Manas",
      side: "SELL",
    });
    const trades = await t.run((ctx) =>
      ctx.db
        .query("trades")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .collect(),
    );
    expect(trades).toHaveLength(1);
    expect(trades[0].player).toBe("Manas");
    expect(trades[0].priceTaken).toBeCloseTo(0.2); // SELL hits bid
  });

  test("overriding the rate re-prices existing trades", async () => {
    const t = convexTest(schema, modules);
    const admin = await addAdmin(t);
    await addPlayer(t, "Pascal", false);
    await addPlayer(t, "Manas", false);
    const gameId = await addGame(t, { maker: "Pascal", bid: 0.2, koUtc: koPast() });

    await asPlayer(t, admin).mutation(api.admin.overrideTrade, {
      gameId,
      player: "Manas",
      side: "SELL",
    });
    // Correct the rate to Canada (away) 1.3 — the SELL must re-price to 1.3.
    await asPlayer(t, admin).mutation(api.admin.overrideMakerBid, {
      gameId,
      bid: 1.3,
      quoteTeam: "AWAY",
    });

    const trade = await t.run((ctx) =>
      ctx.db
        .query("trades")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .first(),
    );
    expect(trade?.priceTaken).toBeCloseTo(1.3);
  });

  test("non-admin is rejected", async () => {
    const t = convexTest(schema, modules);
    const yas = await addPlayer(t, "Yas");
    const gameId = await addGame(t, { maker: "Pascal", koUtc: koPast() });
    await expect(
      asPlayer(t, yas).mutation(api.admin.overrideMakerBid, { gameId, bid: 0.2 }),
    ).rejects.toThrow(/admins only/i);
  });
});
