import { query } from "./_generated/server";
import { QueryCtx } from "./_generated/server";
import { round2 } from "./lib/game";

/** Settled games oldest-first, with their trades, for cumulative P&L. */
async function settledWithTrades(ctx: QueryCtx) {
  const settled = (
    await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "SETTLED"))
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

/** Per-game P&L deltas: each taker keeps Trade.pnl, maker = -sum (spec §5). */
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

/** Exact net £ per player from settled games (optionally one stage). Reused by
 *  the standings + ledger. Always seeds the full roster at 0. */
export async function pnlMap(
  ctx: QueryCtx,
  stage?: string,
): Promise<{ cum: Map<string, number>; settledCount: number }> {
  const roster = (await ctx.db.query("players").collect()).map((p) => p.name);
  const cum = new Map<string, number>(roster.map((n) => [n, 0]));

  const settled = await settledWithTrades(ctx);
  let count = 0;
  for (const { game, trades } of settled) {
    if (stage && game.stage !== stage) continue;
    applyGamePnl(cum, game, trades);
    count++;
  }
  return { cum, settledCount: count };
}

/**
 * Net £ per player, recomputed from SETTLED games. Always lists the full roster
 * (0 until they've settled anything) so the table is stable. DERIVED — spec §4.
 */
export const standings = query({
  args: {},
  handler: async (ctx) => {
    const { cum, settledCount } = await pnlMap(ctx);
    const rows = [...cum.entries()]
      .map(([player, pnl]) => ({ player, pnl: round2(pnl) }))
      .sort((a, b) => b.pnl - a.pnl || a.player.localeCompare(b.player));
    return { rows, settledCount };
  },
});

/**
 * Cumulative-£ series for the equity curve — one value per player at each
 * settled game, in chronological order. Recharts-friendly flat points.
 */
export const equityCurve = query({
  args: {},
  handler: async (ctx) => {
    const roster = (await ctx.db.query("players").collect()).map((p) => p.name);
    const cum = new Map<string, number>(roster.map((n) => [n, 0]));

    const settled = await settledWithTrades(ctx);

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

    // Only draw lines for players who have actually moved (keeps it readable).
    const active = roster.filter((p) => (cum.get(p) ?? 0) !== 0);

    return { players: active.length ? active : roster, points, settledCount: settled.length };
  },
});
