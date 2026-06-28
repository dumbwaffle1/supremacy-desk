import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { round2 } from "./lib/game";

async function settledWithTrades(ctx: QueryCtx, leagueId: Id<"leagues">) {
  const settled = (
    await ctx.db
      .query("games")
      .withIndex("by_league_status", (q) =>
        q.eq("leagueId", leagueId).eq("status", "SETTLED"),
      )
      .collect()
  ).sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0) || a.gameNo - b.gameNo);

  return Promise.all(
    settled.map(async (game) => ({
      game,
      trades: await ctx.db
        .query("trades")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect(),
    })),
  );
}

function applyGamePnl(
  cum: Map<string, number>,
  game: { makerPlayer?: string },
  trades: { player: string; pnl?: number }[],
) {
  let makerCounter = 0;
  for (const t of trades) {
    const pnl = t.pnl ?? 0;
    cum.set(t.player, (cum.get(t.player) ?? 0) + pnl);
    makerCounter += pnl;
  }
  if (game.makerPlayer)
    cum.set(game.makerPlayer, (cum.get(game.makerPlayer) ?? 0) - makerCounter);
}

/** Exact net £ per player in a league (optionally one stage). */
export async function pnlMap(
  ctx: QueryCtx,
  leagueId: Id<"leagues">,
  stage?: string,
): Promise<{ cum: Map<string, number>; settledCount: number }> {
  const roster = (
    await ctx.db
      .query("players")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect()
  ).map((p) => p.name);
  const cum = new Map<string, number>(roster.map((n) => [n, 0]));

  const settled = await settledWithTrades(ctx, leagueId);
  let count = 0;
  for (const { game, trades } of settled) {
    if (stage && game.stage !== stage) continue;
    applyGamePnl(cum, game, trades);
    count++;
  }
  return { cum, settledCount: count };
}

export const standings = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const { cum, settledCount } = await pnlMap(ctx, leagueId);
    const rows = [...cum.entries()]
      .map(([player, pnl]) => ({ player, pnl: round2(pnl) }))
      .sort((a, b) => b.pnl - a.pnl || a.player.localeCompare(b.player));
    return { rows, settledCount };
  },
});

export const equityCurve = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const roster = (
      await ctx.db
        .query("players")
        .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
        .collect()
    ).map((p) => p.name);
    const cum = new Map<string, number>(roster.map((n) => [n, 0]));
    const settled = await settledWithTrades(ctx, leagueId);

    const point = (name: string) => {
      const p: Record<string, number | string> = { name };
      for (const player of roster) p[player] = round2(cum.get(player) ?? 0);
      return p;
    };

    const points: Record<string, number | string>[] = [point("Start")];
    for (const { game, trades } of settled) {
      applyGamePnl(cum, game, trades);
      points.push(point(`#${game.gameNo}`));
    }

    const active = roster.filter((p) => (cum.get(p) ?? 0) !== 0);
    return {
      players: active.length ? active : roster,
      points,
      settledCount: settled.length,
    };
  },
});
