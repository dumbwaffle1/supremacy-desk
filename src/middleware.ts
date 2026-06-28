import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

// Refreshes the auth session cookie on navigation. Requires NEXT_PUBLIC_CONVEX_URL
// to be set in the environment (locally via .env.local, on Vercel via project env)
// before deploying — see DEPLOY.md for ordering.
export default convexAuthNextjsMiddleware();

export const config = {
  // Run on everything except static files and Next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
