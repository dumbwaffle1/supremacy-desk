import { convexAuth } from "@convex-dev/auth/server";
import Resend from "@auth/core/providers/resend";

// Email magic-link sign-in via Resend (primary method).
// Sign in with Apple is added as a second provider later (see spec §9.1).
//
// Required Convex deployment env vars (set with `npx convex env set ...`):
//   AUTH_RESEND_KEY   — your Resend API key (re_...)
//   AUTH_EMAIL_FROM   — verified sender, e.g. "Supremacy Desk <desk@yourdomain>"
//                       (falls back to Resend's shared test sender if unset)
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Resend({
      id: "resend",
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? "Supremacy Desk <onboarding@resend.dev>",
    }),
  ],
});
