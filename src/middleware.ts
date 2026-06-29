import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

// Refreshes the auth session cookie on navigation. Requires NEXT_PUBLIC_CONVEX_URL
// to be set in the environment (locally via .env.local, on Vercel via project env)
// before deploying — see DEPLOY.md for ordering.
//
// cookieConfig.maxAge is CRITICAL: without it the auth cookies default to
// *session* cookies (no Max-Age), which mobile browsers and installed PWAs drop
// whenever the app is backgrounded/closed — causing constant surprise logouts
// even though the server session lasts 90 days. Persist the cookie for the full
// session window so one sign-in really does last the tournament.
export default convexAuthNextjsMiddleware(undefined, {
  cookieConfig: { maxAge: 60 * 60 * 24 * 90 }, // 90 days, matches session.totalDurationMs
});

export const config = {
  // Run on everything except static files and Next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
