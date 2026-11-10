import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STAKES, STAGES } from "../src/config/constants";

const modules = import.meta.glob("./**/*.ts");

type T = ReturnType<typeof convexTest>;

const as = (t: T, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|session` });

/**
 * One league with a settled game, a trade and a chat line, and these people:
 * owner (seat "Owner"), friend (joined with the invite link, seat "Friend"),
 * joiner (joined, no seat yet), legacy (a seat but no membership row, from
 * before memberships existed), admin (super-admin, not in the league) and
 * outsider (signed in, never joined). "Spare" is an unclaimed seat.
 */
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (email: string, isAdmin = false) =>
      ctx.db.insert("users", { email, isAdmin });
    const owner = await user("owner@t.co");
    const friend = await user("friend@t.co");
    const joiner = await user("joiner@t.co");
    const legacy = await user("legacy@t.co");
    const admin = await user("admin@t.co", true);
    const outsider = await user("outsider@t.co");

    const leagueId = await ctx.db.insert("leagues", {
      name: "Office Supremacy",
      tournament: "WC2026",
      width: 0.2,
      stakes: STAGES.map((stage) => ({ stage, amount: STAKES[stage] * 2 })),
      settlementBasis: "120min_exclPens",
      ownerUserId: owner,
      inviteCode: "JOINJOIN",
    });
    for (const userId of [owner, friend, joiner])
      await ctx.db.insert("memberships", { leagueId, userId });
    await ctx.db.insert("players", { leagueId, name: "Owner", claimedByUserId: owner });
    await ctx.db.insert("players", { leagueId, name: "Friend", claimedByUserId: friend });
    await ctx.db.insert("players", { leagueId, name: "Legacy", claimedByUserId: legacy });
    const spare = await ctx.db.insert("players", { leagueId, name: "Spare" });

    const gameId = await ctx.db.insert("games", {
      leagueId,
      gameNo: 1,
      stage: "R32",
      status: "SETTLED",
      makerPlayer: "Owner",
      bid: 0.5,
      settleHome: 2,
      settleAway: 0,
      settledAt: Date.now(),
    });
    await ctx.db.insert("trades", {
      leagueId,
      gameId,
      player: "Friend",
      side: "BUY",
      priceTaken: 0.7,
      stake: 10,
      pnl: 13,
      submittedAt: Date.now(),
    });
    await ctx.db.insert("feed", {
      leagueId,
      kind: "chat",
      actor: "Friend",
      authorUserId: friend,
      text: "gg",
    });
    return { owner, friend, joiner, legacy, admin, outsider, leagueId, gameId, spare };
  });
  return { t, ...ids };
}

describe("league data is for the league's people only", () => {
  test("outsiders and signed-out visitors get nothing, even with the league's id", async () => {
    const s = await setup();
    const { leagueId, gameId } = s;
    for (const client of [s.t, as(s.t, s.outsider)]) {
      expect(await client.query(api.players.list, { leagueId })).toEqual([]);
      expect(await client.query(api.games.list, { leagueId })).toEqual([]);
      expect(await client.query(api.games.detail, { gameId })).toBeNull();
      expect(await client.query(api.trades.forGame, { gameId })).toEqual([]);
      expect(await client.query(api.feed.list, { leagueId })).toEqual([]);
      expect(await client.query(api.feed.unreadCount, { leagueId })).toBe(0);
      expect((await client.query(api.standings.standings, { leagueId })).rows).toEqual([]);
      expect((await client.query(api.standings.equityCurve, { leagueId })).points).toEqual([]);
      const ledger = await client.query(api.ledger.ledger, { leagueId });
      expect(ledger.balances).toEqual([]);
      expect(ledger.transfers).toEqual([]);

      // The gate still learns the league exists, to say "You're not in this
      // Supremacy", but not its name, invite code or stakes.
      const league = await client.query(api.leagues.get, { leagueId });
      expect(league?.me.isMember).toBe(false);
      expect(league?.name).toBe("");
      expect(league?.inviteCode).toBeNull();
      expect(league?.stakes.R32).toBe(STAKES.R32);
    }
  });

  test("owner, members, old seat-holders and super-admins still see everything", async () => {
    const s = await setup();
    const { leagueId, gameId } = s;
    for (const who of [s.owner, s.friend, s.joiner, s.legacy, s.admin]) {
      const c = as(s.t, who);
      expect((await c.query(api.players.list, { leagueId })).map((p) => p.name)).toEqual([
        "Owner",
        "Friend",
        "Legacy",
        "Spare",
      ]);
      expect(await c.query(api.games.list, { leagueId })).toHaveLength(1);
      expect((await c.query(api.games.detail, { gameId }))?.book).toHaveLength(1);
      expect(await c.query(api.trades.forGame, { gameId })).toHaveLength(1);
      expect(await c.query(api.feed.list, { leagueId })).toHaveLength(1);
      expect((await c.query(api.standings.standings, { leagueId })).rows).toContainEqual({
        player: "Friend",
        pnl: 13,
      });
      expect((await c.query(api.standings.equityCurve, { leagueId })).points).toHaveLength(2);
      expect((await c.query(api.ledger.ledger, { leagueId })).transfers).toEqual([
        { from: "Owner", to: "Friend", amount: 13, paid: false },
      ]);
      const league = await c.query(api.leagues.get, { leagueId });
      expect(league?.name).toBe("Office Supremacy");
      expect(league?.stakes.R32).toBe(STAKES.R32 * 2);
    }
    // The friend wrote the only chat line, so it's unread for the owner only.
    expect(await as(s.t, s.owner).query(api.feed.unreadCount, { leagueId })).toBe(1);
    expect(await as(s.t, s.friend).query(api.feed.unreadCount, { leagueId })).toBe(0);
  });

  test("a seat can only be claimed or added after joining with the invite link", async () => {
    const s = await setup();
    const { leagueId, spare } = s;
    const outsider = as(s.t, s.outsider);

    await expect(
      outsider.mutation(api.users.claimPlayer, { leagueId, playerId: spare }),
    ).rejects.toThrow(/invite link/);
    await expect(
      outsider.mutation(api.users.addAndClaimPlayer, { leagueId, name: "Sneaky" }),
    ).rejects.toThrow(/invite link/);
    await expect(
      s.t.mutation(api.users.claimPlayer, { leagueId, playerId: spare }),
    ).rejects.toThrow(/Sign in/);

    const after = await s.t.run(async (ctx) => ({
      players: await ctx.db.query("players").collect(),
      memberships: await ctx.db.query("memberships").collect(),
    }));
    expect(after.players.map((p) => p.name)).not.toContain("Sneaky");
    expect(after.players.find((p) => p._id === spare)?.claimedByUserId).toBeUndefined();
    expect(after.memberships.some((m) => m.userId === s.outsider)).toBe(false);

    // With the invite code, the same person joins and can then take a seat.
    await outsider.mutation(api.leagues.join, { inviteCode: "joinjoin" });
    expect(
      await outsider.mutation(api.users.claimPlayer, { leagueId, playerId: spare }),
    ).toEqual({ name: "Spare" });
    // Someone who joined earlier but has no seat can add their name.
    expect(
      await as(s.t, s.joiner).mutation(api.users.addAndClaimPlayer, { leagueId, name: "Joiner" }),
    ).toEqual({ name: "Joiner" });
  });

  test("marking the feed seen does nothing for an outsider", async () => {
    const s = await setup();
    const { leagueId } = s;
    await as(s.t, s.outsider).mutation(api.feed.markSeen, { leagueId });
    expect(await s.t.run((ctx) => ctx.db.query("feedReads").collect())).toEqual([]);
    await as(s.t, s.owner).mutation(api.feed.markSeen, { leagueId });
    expect(await s.t.run((ctx) => ctx.db.query("feedReads").collect())).toHaveLength(1);
  });
});
