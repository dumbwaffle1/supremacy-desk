import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ADMIN_EMAIL } from "../src/config/constants";

/** Recent audit entries, newest first (admins only). */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    const isAdmin =
      !!user?.isAdmin ||
      (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (!isAdmin) return [];

    const rows = await ctx.db.query("auditLogs").order("desc").take(80);
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
