import { convexAuth } from "@convex-dev/auth/server";
import Resend from "@auth/core/providers/resend";
import { ADMIN_EMAIL } from "../src/config/constants";

// Email magic-link sign-in (primary). Sign in with Apple is added as a second
// provider later (see spec §9.1) — the login screen already leaves a slot.
//
// The provider ALWAYS logs the sign-in link to the Convex logs, so you can sign
// in during development without any email delivery (copy the link from the
// `npx convex dev` terminal). When AUTH_RESEND_KEY is set it also emails it.
const ResendMagicLink = Resend({
  id: "resend",
  apiKey: process.env.AUTH_RESEND_KEY,
  from: process.env.AUTH_EMAIL_FROM ?? "Supremacy Desk <onboarding@resend.dev>",
  async sendVerificationRequest({ identifier: email, url, provider }) {
    // Always log the link first, so sign-in works from the Convex logs even
    // before a sending domain is verified in Resend.
    console.log(`[auth] magic sign-in link for ${email}: ${url}`);
    if (!process.env.AUTH_RESEND_KEY) return; // log-only, no email needed

    // Best-effort send: a failure (e.g. unverified domain) must NOT block
    // sign-in — the link is already logged. We surface the reason instead.
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: provider.from,
          to: [email],
          subject: "Your Supremacy Desk sign-in link",
          html: `<p>Tap to sign in to <strong>Supremacy Desk</strong>:</p>
<p><a href="${url}">Sign in</a></p>
<p style="color:#888;font-size:12px">If you didn't request this, you can ignore it.</p>`,
        }),
      });
      if (!res.ok) {
        console.error(
          `[auth] Resend send failed (${res.status}): ${await res.text()} — ` +
            `use the link logged above. Verify AUTH_EMAIL_FROM's domain in Resend.`,
        );
      }
    } catch (err) {
      console.error(`[auth] Resend send threw: ${String(err)} — use the logged link.`);
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendMagicLink],
  callbacks: {
    // Flag isAdmin when the verified email matches ADMIN_EMAIL. Runs on first
    // sign-in (and subsequent ones) — see spec §9.1 / Prompt 2.
    async afterUserCreatedOrUpdated(ctx, { userId, profile }) {
      const email = (profile.email ?? "").toLowerCase();
      const user = await ctx.db.get(userId);
      const patch: Record<string, unknown> = {};
      if (email && email === ADMIN_EMAIL.toLowerCase() && !user?.isAdmin) {
        patch.isAdmin = true;
      }
      if (!user?.displayName && profile.email) {
        patch.displayName = profile.email;
      }
      if (Object.keys(patch).length > 0) await ctx.db.patch(userId, patch);
    },
  },
});
