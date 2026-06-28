import { v } from "convex/values";
import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { makeInviteCode } from "./lib/invite";
import { getStakes } from "./tournament";
import { pnlMap } from "./standings";
import { stageValidator } from "./schema";
import {
  ADMIN_EMAIL,
  SETTLEMENT_BASIS,
  STAGES,
  STAKES,
  WIDTH,
  type Stage,
} from "../src/config/constants";

/** Owner of the league (or a global super-admin) may run admin actions on it. */
export async function requireLeagueAdmin(
  ctx: MutationCtx,
  leagueId: Id<"leagues">,
): Promise<{ actor: string; userId: Id<"users"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in first.");
  const league = await ctx.db.get(leagueId);
  if (!league) throw new Error("No such league.");
  const user = await ctx.db.get(userId);
  const ok =
    league.ownerUserId === userId ||
    !!user?.isAdmin ||
    (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (!ok) throw new Error("Only the league owner can do that.");
  return { actor: user?.email ?? "owner", userId };
}

const STAGE_ORDER: Record<Stage, number> = {
  R32: 0,
  R16: 1,
  QF: 2,
  SF: 3,
  "3PO": 4,
  F: 5,
};

/** Copy the fixture games (no maker/bid/trades) from a source league. Games that
 *  have already kicked off are VOID — a new league can't play matches that are
 *  already underway/over. */
async function seedGamesFrom(
  ctx: MutationCtx,
  leagueId: Id<"leagues">,
  sourceLeagueId: Id<"leagues">,
) {
  const now = Date.now();
  const src = await ctx.db
    .query("games")
    .withIndex("by_league", (q) => q.eq("leagueId", sourceLeagueId))
    .collect();
  for (const g of src) {
    const played = g.koUtc !== undefined && g.koUtc <= now;
    await ctx.db.insert("games", {
      leagueId,
      fixtureId: g.fixtureId,
      gameNo: g.gameNo,
      stage: g.stage,
      round: g.round,
      home: g.home,
      away: g.away,
      koUtc: g.koUtc,
      status: played ? "VOID" : g.status === "SETTLED" ? "FT" : g.status,
    });
  }
}

/** Assign makers round-robin across OPEN R32 + R16 games (the random-draw
 *  stages) so every early game has a maker. QF/SF/3PO/F makers are decided by
 *  standings (the admin draw) and are NOT auto-assigned here. Committed/started/
 *  settled games keep theirs. Runs on creation + whenever the roster changes. */
export async function rebalanceMakers(ctx: MutationCtx, leagueId: Id<"leagues">) {
  const players = (
    await ctx.db
      .query("players")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect()
  )
    .sort((a, b) => a._creationTime - b._creationTime)
    .map((p) => p.name);
  if (players.length === 0) return;

  const now = Date.now();
  const games = (
    await ctx.db
      .query("games")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect()
  ).sort(
    (a, b) =>
      STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] ||
      (a.koUtc ?? Infinity) - (b.koUtc ?? Infinity) ||
      a.gameNo - b.gameNo,
  );

  let i = 0;
  for (const g of games) {
    if (g.stage !== "R32" && g.stage !== "R16") continue; // QF+ = standings auto
    if (g.makerManual) continue; // admin set this by hand
    const open =
      g.status === "SCHEDULED" &&
      g.bid === undefined &&
      (g.koUtc === undefined || g.koUtc > now);
    if (!open) continue;
    const player = players[i % players.length];
    if (g.makerPlayer !== player) await ctx.db.patch(g._id, { makerPlayer: player });
    i++;
  }
}

/**
 * Auto-assign QF/SF/3PO/F makers from current standings: the bottom 4 by P&L
 * make the QFs; the top 4 make the Final (1st), 3rd-place (2nd) and the two
 * semis (3rd, 4th). Only touches OPEN games that aren't admin-overridden, so it
 * keeps updating as standings move. Spec §6.
 */
export async function assignStandingsMakers(
  ctx: MutationCtx,
  leagueId: Id<"leagues">,
) {
  const { cum } = await pnlMap(ctx, leagueId);
  const ranked = [...cum.entries()]
    .map(([player, pnl]) => ({ player, pnl }))
    .sort((a, b) => b.pnl - a.pnl || a.player.localeCompare(b.player))
    .map((r) => r.player);
  if (ranked.length < 8) return; // needs a full field to split top/bottom 4

  const bottom4 = ranked.slice(-4);
  const top4 = ranked.slice(0, 4);
  const now = Date.now();
  const games = await ctx.db
    .query("games")
    .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
    .collect();

  const set = async (g: (typeof games)[number], player: string | undefined) => {
    const open =
      g.status === "SCHEDULED" &&
      g.bid === undefined &&
      (g.koUtc === undefined || g.koUtc > now) &&
      !g.makerManual;
    if (open && player && g.makerPlayer !== player)
      await ctx.db.patch(g._id, { makerPlayer: player });
  };

  const ofStage = (s: Stage) =>
    games.filter((g) => g.stage === s).sort((a, b) => a.gameNo - b.gameNo);

  const qf = ofStage("QF");
  for (let i = 0; i < qf.length; i++) await set(qf[i], bottom4[i]);
  const sf = ofStage("SF");
  if (sf[0]) await set(sf[0], top4[2]);
  if (sf[1]) await set(sf[1], top4[3]);
  if (ofStage("3PO")[0]) await set(ofStage("3PO")[0], top4[1]);
  if (ofStage("F")[0]) await set(ofStage("F")[0], top4[0]);
}

/** One-off + cron: refresh standings-based makers across all leagues. */
export const autoMakers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const leagues = await ctx.db.query("leagues").collect();
    for (const l of leagues) await assignStandingsMakers(ctx, l._id);
    return { leagues: leagues.length };
  },
});

/** One-off: ensure every league's open games have a maker. */
export const rebalanceAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const leagues = await ctx.db.query("leagues").collect();
    for (const l of leagues) await rebalanceMakers(ctx, l._id);
    return { leagues: leagues.length };
  },
});

/** One-off: clear auto-assigned makers on open QF/SF/3PO/F games — those stages
 *  are decided by standings via the admin draw, not round-robin. */
export const clearLateMakers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    let cleared = 0;
    for (const g of games) {
      if (!["QF", "SF", "3PO", "F"].includes(g.stage)) continue;
      if (g.status === "SCHEDULED" && g.bid === undefined && g.makerPlayer) {
        await ctx.db.patch(g._id, { makerPlayer: undefined });
        cleared++;
      }
    }
    return { cleared };
  },
});

/** Leagues you own or have joined, enriched for the homepage. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const owned = await ctx.db
      .query("leagues")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const memberLeagues = await Promise.all(
      memberships.map((m) => ctx.db.get(m.leagueId)),
    );

    const seen = new Set<string>();
    const leagues = [];
    for (const l of [...owned, ...memberLeagues]) {
      if (!l || seen.has(l._id)) continue;
      seen.add(l._id);
      leagues.push(l);
    }

    return Promise.all(
      leagues.map(async (l) => {
        const players = await ctx.db
          .query("players")
          .withIndex("by_league", (q) => q.eq("leagueId", l._id))
          .collect();
        const settled = await ctx.db
          .query("games")
          .withIndex("by_league_status", (q) =>
            q.eq("leagueId", l._id).eq("status", "SETTLED"),
          )
          .collect();
        return {
          _id: l._id,
          name: l.name,
          tournament: l.tournament,
          isOwner: l.ownerUserId === userId,
          myPlayer: players.find((p) => p.claimedByUserId === userId)?.name ?? null,
          playerCount: players.length,
          settledCount: settled.length,
        };
      }),
    );
  },
});

/** All leagues the super-admin doesn't own/belong to (peek list). */
export const others = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    const isSuper =
      !!user?.isAdmin ||
      (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (!isSuper) return [];

    const all = await ctx.db.query("leagues").collect();
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const joined = new Set<string>(memberships.map((m) => m.leagueId));

    const rest = all.filter(
      (l) => l.ownerUserId !== userId && !joined.has(l._id),
    );
    return Promise.all(
      rest.map(async (l) => {
        const players = await ctx.db
          .query("players")
          .withIndex("by_league", (q) => q.eq("leagueId", l._id))
          .collect();
        const owner = l.ownerUserId ? await ctx.db.get(l.ownerUserId) : null;
        const settled = await ctx.db
          .query("games")
          .withIndex("by_league_status", (q) =>
            q.eq("leagueId", l._id).eq("status", "SETTLED"),
          )
          .collect();
        return {
          _id: l._id,
          name: l.name,
          playerCount: players.length,
          settledCount: settled.length,
          ownerEmail: owner?.email ?? null,
        };
      }),
    );
  },
});

/** One league + the viewer's role/seat. */
export const get = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const league = await ctx.db.get(leagueId);
    if (!league) return null;

    const userId = await getAuthUserId(ctx);
    let player: string | null = null;
    let isOwner = false;
    let isSuperAdmin = false;
    let isMember = false;
    if (userId) {
      const user = await ctx.db.get(userId);
      isOwner = league.ownerUserId === userId;
      isSuperAdmin =
        !!user?.isAdmin ||
        (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
      const p = await ctx.db
        .query("players")
        .withIndex("by_league_claimedBy", (q) =>
          q.eq("leagueId", leagueId).eq("claimedByUserId", userId),
        )
        .first();
      player = p?.name ?? null;
      const m = await ctx.db
        .query("memberships")
        .withIndex("by_league_user", (q) =>
          q.eq("leagueId", leagueId).eq("userId", userId),
        )
        .first();
      isMember = !!m || isOwner || !!p;
    }
    const isAdmin = isOwner || isSuperAdmin;

    return {
      _id: league._id,
      name: league.name,
      tournament: league.tournament,
      width: league.width,
      stakes: await getStakes(ctx, leagueId),
      inviteCode: isMember || isSuperAdmin ? league.inviteCode : null,
      me: { player, isOwner, isAdmin, isMember, isSuperAdmin },
    };
  },
});

/** Public-ish summary for the join screen. */
export const byInvite = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const league = await ctx.db
      .query("leagues")
      .withIndex("by_invite", (q) =>
        q.eq("inviteCode", inviteCode.trim().toUpperCase()),
      )
      .first();
    if (!league) return null;
    const players = await ctx.db
      .query("players")
      .withIndex("by_league", (q) => q.eq("leagueId", league._id))
      .collect();
    return {
      _id: league._id,
      name: league.name,
      tournament: league.tournament,
      playerCount: players.length,
    };
  },
});

/** Create a new league (Supremacy). Seeds roster + this league's games. */
export const create = mutation({
  args: {
    name: v.string(),
    myName: v.string(),
    players: v.array(v.string()),
    stakes: v.optional(
      v.array(v.object({ stage: stageValidator, amount: v.number() })),
    ),
  },
  handler: async (ctx, { name, myName, players, stakes }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");
    const leagueName = name.trim() || "WC2026 Supremacy";
    const owner = myName.trim();
    if (!owner) throw new Error("Enter your name.");

    const leagueId = await ctx.db.insert("leagues", {
      name: leagueName,
      tournament: "WC2026",
      width: WIDTH,
      stakes: stakes ?? STAGES.map((stage) => ({ stage, amount: STAKES[stage] })),
      settlementBasis: SETTLEMENT_BASIS,
      ownerUserId: userId,
      inviteCode: makeInviteCode(),
    });
    await ctx.db.insert("memberships", { leagueId, userId });

    const seen = new Set<string>();
    const add = async (nm: string, claim: boolean) => {
      const t = nm.trim();
      if (!t || seen.has(t.toLowerCase())) return;
      seen.add(t.toLowerCase());
      await ctx.db.insert("players", {
        leagueId,
        name: t,
        claimedByUserId: claim ? userId : undefined,
        addedByUserId: userId,
      });
    };
    await add(owner, true);
    for (const p of players) await add(p, false);

    // Seed this league's games from the earliest league (which holds fixtures).
    const source = await ctx.db.query("leagues").order("asc").first();
    if (source && source._id !== leagueId) {
      await seedGamesFrom(ctx, leagueId, source._id);
    }
    // Give every open game a maker straight away.
    await rebalanceMakers(ctx, leagueId);

    await ctx.db.insert("auditLogs", {
      leagueId,
      actor: owner,
      action: "league_created",
      after: { name: leagueName },
    });
    const league = await ctx.db.get(leagueId);
    return { leagueId, inviteCode: league!.inviteCode };
  },
});

/** Join a league by invite code (does not auto-claim a seat). */
export const join = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");
    const league = await ctx.db
      .query("leagues")
      .withIndex("by_invite", (q) =>
        q.eq("inviteCode", inviteCode.trim().toUpperCase()),
      )
      .first();
    if (!league) throw new Error("That invite code isn't valid.");
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", league._id).eq("userId", userId),
      )
      .first();
    if (!existing)
      await ctx.db.insert("memberships", { leagueId: league._id, userId });
    return { leagueId: league._id };
  },
});
