"use client";

import { ReactNode } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { SignIn } from "@/components/SignIn";
import { BrandMark } from "@/components/BrandMark";

export function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6">
      <span className="animate-pulse">
        <BrandMark className="size-10 rounded-xl" />
      </span>
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

/** Auth only: sign-in when logged out, otherwise render the app. */
export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <FullScreen>Loading…</FullScreen>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}
