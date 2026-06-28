import { v } from "convex/values";
import { query } from "./_generated/server";

/** Roster for a league, with claim status. */
export const list = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
    return players
      .sort((a, b) => a._creationTime - b._creationTime) // join order
      .map((p) => ({
        _id: p._id,
        name: p.name,
        claimed: p.claimedByUserId !== undefined,
      }));
  },
});
