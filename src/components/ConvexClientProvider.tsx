"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// Created once. Guarded so the static shell still builds/loads before a Convex
// deployment exists; once NEXT_PUBLIC_CONVEX_URL is set, auth + realtime engage.
const convex = convexUrl ? new ConvexReactClient(convexUrl) : undefined;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) return <>{children}</>;
  return (
    <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>
  );
}
