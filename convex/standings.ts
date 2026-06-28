import { query } from "./_generated/server";

/**
 * Standings = net £ P&L per player, recomputed from SETTLED games' trades.
 * DERIVED (never a stored counter) so re-settles are always correct — spec §4.
 *
 * Per settled game: each taker keeps their Trade.pnl; the maker is the
 * counterparty to everyone, so makerPnl = -sum(taker pnl) — spec §5.
 */
export const standings = query({
  args: {},
  handler: async (ctx) => {
    const settled = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "SETTLED"))
      .collect();

    const byPlayer = new Map<string, number>();
    const add = (player: string, amount: number) =>
      byPlayer.set(player, (byPlayer.get(player) ?? 0) + amount);

    for (const game of settled) {
      const trades = await ctx.db
        .query("trades")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();

      let makerCounter = 0;
      for (const t of trades) {
        const pnl = t.pnl ?? 0;
        add(t.player, pnl);
        makerCounter += pnl;
      }
      if (game.makerPlayer) add(game.makerPlayer, -makerCounter);
    }

    return [...byPlayer.entries()]
      .map(([player, pnl]) => ({ player, pnl: Math.round(pnl * 100) / 100 }))
      .sort((a, b) => b.pnl - a.pnl);
  },
});
