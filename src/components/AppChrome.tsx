"use client";

import { ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut } from "lucide-react";
import { BottomTabBar } from "@/components/BottomTabBar";
import { BrandMark } from "@/components/BrandMark";
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
        <header className="glass sticky top-0 z-30 border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <div className="leading-none">
                <div className="font-display text-[15px] font-bold tracking-tight">
                  Supremacy
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <span className="live-dot inline-block size-1.5 rounded-full bg-brand" />
                  WC2026 · Knockouts
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-xs font-medium">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: colorFor(playerName) }}
                />
                {playerName}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Sign out"
                className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="scanline h-px w-full opacity-60" />
        </header>

        <main className="flex-1 px-4 pb-28 pt-5">{children}</main>
      </div>
      <BottomTabBar isAdmin={isAdmin} />
    </>
  );
}
