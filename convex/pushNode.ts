"use node";

import webpush from "web-push";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/** Send a web-push notification to all of a user's subscribed devices. */
export const send = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, { userId, title, body, url }) => {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      console.error("[push] VAPID keys not set — skipping send");
      return;
    }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@supremacy.app",
      pub,
      priv,
    );

    const subs = await ctx.runQuery(internal.push.subsForUser, { userId });
    const payload = JSON.stringify({ title, body, url: url ?? "/" });

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await ctx.runMutation(internal.push.pruneSub, { endpoint: s.endpoint });
        } else {
          console.error(`[push] send failed (${code ?? "?"})`);
        }
      }
    }
  },
});
