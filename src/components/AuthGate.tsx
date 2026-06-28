"use client";

import { ReactNode } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignIn } from "@/components/SignIn";
import { ClaimSeat } from "@/components/ClaimSeat";
import { AppChrome } from "@/components/AppChrome";
import { BrandMark } from "@/components/BrandMark";

function FullScreen({ children }: { children: ReactNode }) {
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

// Decides what the whole app shows: sign-in → claim seat → the app chrome.
export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <FullScreen>Loading…</FullScreen>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <ClaimGate>{children}</ClaimGate>
      </Authenticated>
    </>
  );
}

function ClaimGate({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  if (me === undefined) return <FullScreen>Loading…</FullScreen>;
  if (!me || !me.playerName) return <ClaimSeat />;
  return (
    <AppChrome playerName={me.playerName} isAdmin={me.isAdmin}>
      {children}
    </AppChrome>
  );
}
