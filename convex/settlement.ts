import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { settlementScore, mapStatus } from "./fixtures";
import { teamSupremacy, tradePnl } from "./lib/game";
import { requireLeagueAdmin } from "./leagues";

const API_MATCHES = "https://api.football-data.org/v4/competitions/WC/matches";

/**
 * Fill every trade's P&L from a final score and mark the game SETTLED.
 * pnl = tradePnl(side, priceTaken, teamSupremacy(quoteTeam, home, away), stake).
 * Maker P&L stays derived (= −sum takers) in the standings query.
 */
async function applySettlement(
  ctx: MutationCtx,
  game: Doc<"games">,
  home: number,
  away: number,
  actor: string,
) {
  const quoteTeam = game.quoteTeam ?? "HOME";
  const sup = teamSupremacy(quoteTeam, home, away);

  const trades = await ctx.db
    .query("trades")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  for (const t of trades) {
    // Use each trade's snapshot stake (so a later stake edit doesn't rewrite it).
    await ctx.db.patch(t._id, { pnl: tradePnl(t.side, t.priceTaken, sup, t.stake) });
  }

  await ctx.db.patch(game._id, {
    settleHome: home,
    settleAway: away,
    settledAt: Date.now(),
    status: "SETTLED",
    liveHome: home,
    liveAway: away,
    settleCandidateHome: undefined,
    settleCandidateAway: undefined,
  });
  await ctx.db.insert("auditLogs", {
    leagueId: game.leagueId,
    actor,
    action: "settle",
    gameId: game._id,
    after: { home, away, supremacy: sup, quoteTeam },
  });
}

/** Games that have kicked off and aren't final — the only ones worth polling. */
export const gamesNeedingPoll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const games = await ctx.db.query("games").collect();
    return games
      .filter(
        (g) =>
          g.fixtureId !== undefined &&
          g.koUtc !== undefined &&
          g.koUtc <= now &&
          g.status !== "SETTLED" &&
          g.status !== "VOID",
      )
      .map((g) => ({ fixtureId: g.fixtureId as number }));
  },
});

const scoreUpdate = v.object({
  fixtureId: v.number(),
  status: v.string(),
  liveHome: v.union(v.number(), v.null()),
  liveAway: v.union(v.number(), v.null()),
  isFinal: v.boolean(),
  settleHome: v.union(v.number(), v.null()),
  settleAway: v.union(v.number(), v.null()),
});

/**
 * Apply a batch of polled scores. Updates live scores; settles a final game
 * only once the same final score has been seen on two consecutive polls
 * (transient-final guard, spec §8).
 */
export const ingestScores = internalMutation({
  args: { updates: v.array(scoreUpdate) },
  handler: async (ctx, { updates }) => {
    let settled = 0;
    let pending = 0;
    let live = 0;

    for (const u of updates) {
      // One fixture can back games in many leagues — update each.
      const games = await ctx.db
        .query("games")
        .withIndex("by_fixtureId", (q) => q.eq("fixtureId", u.fixtureId))
        .collect();
      const liveHome = u.liveHome ?? undefined;
      const liveAway = u.liveAway ?? undefined;

      for (const game of games) {
        if (game.status === "SETTLED" || game.status === "VOID") continue;

        if (u.isFinal && u.settleHome !== null && u.settleAway !== null) {
          if (
            game.settleCandidateHome === u.settleHome &&
            game.settleCandidateAway === u.settleAway
          ) {
            await applySettlement(ctx, game, u.settleHome, u.settleAway, "system");
            settled++;
          } else {
            await ctx.db.patch(game._id, {
              status: "FT",
              liveHome,
              liveAway,
              settleCandidateHome: u.settleHome,
              settleCandidateAway: u.settleAway,
            });
            pending++;
          }
        } else {
          await ctx.db.patch(game._id, {
            status: mapStatus(u.status),
            liveHome,
            liveAway,
            settleCandidateHome: undefined,
            settleCandidateAway: undefined,
          });
          live++;
        }
      }
    }
    return { settled, pending, live };
  },
});

/** 10-min cron: poll in-play/finished games, store live scores, auto-settle. */
export const pollScores = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const key = process.env.FOOTBALL_DATA_KEY;
    if (!key) {
      console.error("[settle] FOOTBALL_DATA_KEY not set");
      return { ok: false, error: "no key" };
    }

    const needing = await ctx.runQuery(internal.settlement.gamesNeedingPoll, {});
    if (needing.length === 0) {
      console.log("[settle] nothing to poll");
      return { ok: true, polled: 0 };
    }

    const res = await fetch(API_MATCHES, { headers: { "X-Auth-Token": key } });
    const avail = res.headers.get("X-Requests-Available-Minute");
    console.log(`[settle] polling ${needing.length} games · ${avail} req/min left`);
    if (!res.ok) {
      console.error(`[settle] HTTP ${res.status}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as {
      matches?: Array<{ id: number; status: string; score?: unknown }>;
    };
    const byId = new Map((json.matches ?? []).map((m) => [m.id, m]));

    const want = new Set(needing.map((n) => n.fixtureId));
    const updates = [];
    for (const fixtureId of want) {
      const m = byId.get(fixtureId);
      if (!m) continue;
      const isFinal = ["FINISHED", "AWARDED"].includes(m.status);
      const score = m.score as
        | { fullTime?: { home: number | null; away: number | null } }
        | undefined;
      const ft = score?.fullTime;
      const settle = isFinal ? settlementScore(m.score as never) : null;
      updates.push({
        fixtureId,
        status: m.status,
        liveHome: ft?.home ?? null,
        liveAway: ft?.away ?? null,
        isFinal,
        settleHome: settle?.home ?? null,
        settleAway: settle?.away ?? null,
      });
    }

    const result = await ctx.runMutation(internal.settlement.ingestScores, { updates });
    console.log(
      `[settle] live ${result.live}, pending ${result.pending}, settled ${result.settled}`,
    );
    return { ok: true, ...result };
  },
});

/* ── admin overrides (rare) ───────────────────────────────────────────── */

/** Emergency manual settle / re-settle with the given score. Audited. */
export const settleManual = mutation({
  args: {
    gameId: v.id("games"),
    home: v.number(),
    away: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { gameId, home, away, reason }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) throw new Error("No such game.");
    const { actor } = await requireLeagueAdmin(ctx, game.leagueId);
    if (
      !Number.isInteger(home) ||
      !Number.isInteger(away) ||
      home < 0 ||
      away < 0
    ) {
      throw new Error("Enter whole, non-negative scores.");
    }
    await applySettlement(
      ctx,
      game,
      home,
      away,
      reason ? `${actor} (${reason})` : actor,
    );
    return { ok: true as const };
  },
});

/** VOID a game — excluded from standings; trade P&L cleared. Audited. */
export const voidGame = mutation({
  args: { gameId: v.id("games"), reason: v.optional(v.string()) },
  handler: async (ctx, { gameId, reason }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) throw new Error("No such game.");
    const { actor } = await requireLeagueAdmin(ctx, game.leagueId);

    const trades = await ctx.db
      .query("trades")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    for (const t of trades) await ctx.db.patch(t._id, { pnl: undefined });

    await ctx.db.patch(gameId, { status: "VOID", settledAt: Date.now() });
    await ctx.db.insert("auditLogs", {
      leagueId: game.leagueId,
      actor,
      action: "void",
      gameId,
      before: { status: game.status },
      after: { reason: reason ?? null },
    });
    return { ok: true as const };
  },
});
