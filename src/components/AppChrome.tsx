"use client";

import { ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut } from "lucide-react";
import { BottomTabBar } from "@/components/BottomTabBar";
import { colorFor } from "@/config/constants";

export function AppChrome({
  playerName,
  isAdmin,
  children,
}: {
  playerName: string;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const { signOut } = useAuthActions();

  return (
    <>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <span className="text-base font-semibold tracking-tight">
            Supremacy&nbsp;Desk
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: colorFor(playerName) }}
              />
              {playerName}
            </span>
            <button
              type="button"
              onClick={() => signOut()}
              aria-label="Sign out"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
      </div>
      <BottomTabBar isAdmin={isAdmin} />
    </>
  );
}
