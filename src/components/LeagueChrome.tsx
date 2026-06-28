"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { ChevronLeft, LogOut } from "lucide-react";
import { BottomTabBar } from "@/components/BottomTabBar";
import { colorFor } from "@/config/constants";

export function LeagueChrome({
  leagueId,
  leagueName,
  playerName,
  peek = false,
  children,
}: {
  leagueId: string;
  leagueName: string;
  playerName: string | null;
  peek?: boolean;
  children: ReactNode;
}) {
  const { signOut } = useAuthActions();

  return (
    <>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <header className="glass sticky top-0 z-30 flex items-center justify-between border-b border-border px-3 py-3">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href="/"
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="All Supremacies"
            >
              <ChevronLeft className="size-5" />
            </Link>
            <span className="truncate text-base font-semibold tracking-tight">
              {leagueName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {peek || !playerName ? (
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                admin · peek
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: colorFor(playerName) }}
                />
                {playerName}
              </span>
            )}
            <button
              onClick={() => signOut()}
              aria-label="Sign out"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5">{children}</main>
      </div>
      <BottomTabBar leagueId={leagueId} />
    </>
  );
}
