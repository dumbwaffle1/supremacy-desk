import { query } from "./_generated/server";
import { offerFor, stakeForStage } from "./lib/game";

/** All games with derived offer + stake, ordered by gameNo. Read by the UI —
 *  screen loads never hit the football API (everything is cached in Convex). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    return games
      .sort((a, b) => a.gameNo - b.gameNo)
      .map((g) => ({
        _id: g._id,
        fixtureId: g.fixtureId ?? null,
        gameNo: g.gameNo,
        stage: g.stage,
        round: g.round ?? null,
        home: g.home ?? null,
        away: g.away ?? null,
        koUtc: g.koUtc ?? null,
        status: g.status,
        makerPlayer: g.makerPlayer ?? null,
        bid: g.bid ?? null,
        offer: g.bid !== undefined ? offerFor(g.bid) : null,
        stake: stakeForStage(g.stage),
        settleHome: g.settleHome ?? null,
        settleAway: g.settleAway ?? null,
        liveHome: g.liveHome ?? null,
        liveAway: g.liveAway ?? null,
      }));
  },
});
