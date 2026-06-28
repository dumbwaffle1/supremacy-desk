"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : undefined;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    // Auth + data need the backend; make a missing URL obvious rather than
    // rendering an app whose hooks would crash with no provider.
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-base font-semibold">Backend not configured</p>
        <p className="text-sm text-muted-foreground">
          Set <span className="font-mono">NEXT_PUBLIC_CONVEX_URL</span> in your
          environment (locally in <span className="font-mono">.env.local</span>,
          on Vercel in project env) and redeploy.
        </p>
      </div>
    );
  }
  return (
    <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>
  );
}
