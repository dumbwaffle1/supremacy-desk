import { query } from "./_generated/server";

/** All roster players, with claim status. Used by the roster/claim UI. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db.query("players").collect();
    return players
      .map((p) => ({
        _id: p._id,
        name: p.name,
        claimed: p.claimedByUserId !== undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
