"use client";

import { ReactNode } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignIn } from "@/components/SignIn";
import { ClaimSeat } from "@/components/ClaimSeat";
import { AppChrome } from "@/components/AppChrome";

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6 text-sm text-muted-foreground">
      {children}
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
