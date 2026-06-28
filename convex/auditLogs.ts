import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ADMIN_EMAIL } from "../src/config/constants";

/** Recent audit entries for a league, newest first (owner/admin only). */
export const recent = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const league = await ctx.db.get(leagueId);
    const user = await ctx.db.get(userId);
    const isAdmin =
      league?.ownerUserId === userId ||
      !!user?.isAdmin ||
      (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (!isAdmin) return [];

    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .order("desc")
      .take(80);
    return rows.map((r) => ({
      _id: r._id,
      ts: r._creationTime,
      actor: r.actor,
      action: r.action,
      before: r.before ?? null,
      after: r.after ?? null,
    }));
  },
});
