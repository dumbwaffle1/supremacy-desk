import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const DEFAULT_PREFS = { maker: true, taker: true, settlement: true };

/** My notification preferences (defaults to all on). */
export const prefs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return DEFAULT_PREFS;
    const row = await ctx.db
      .query("notifPrefs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return row
      ? { maker: row.maker, taker: row.taker, settlement: row.settlement }
      : DEFAULT_PREFS;
  },
});

export const setPrefs = mutation({
  args: { maker: v.boolean(), taker: v.boolean(), settlement: v.boolean() },
  handler: async (ctx, prefsArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");
    const row = await ctx.db
      .query("notifPrefs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row) await ctx.db.patch(row._id, prefsArgs);
    else await ctx.db.insert("notifPrefs", { userId, ...prefsArgs });
    return { ok: true as const };
  },
});

/** Whether this device is subscribed (by endpoint). */
export const isSubscribed = query({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const sub = await ctx.db
      .query("pushSubs")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    return !!sub;
  },
});

export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, { endpoint, p256dh, auth }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");
    const existing = await ctx.db
      .query("pushSubs")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { userId, p256dh, auth });
    } else {
      await ctx.db.insert("pushSubs", { userId, endpoint, p256dh, auth });
    }
    return { ok: true as const };
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const subs = await ctx.db
      .query("pushSubs")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .collect();
    await Promise.all(subs.map((s) => ctx.db.delete(s._id)));
    return { ok: true as const };
  },
});

/* ── internal (for the Node send action) ──────────────────────────────── */

export const subsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("pushSubs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
});

export const pruneSub = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const s = await ctx.db
      .query("pushSubs")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (s) await ctx.db.delete(s._id);
  },
});
