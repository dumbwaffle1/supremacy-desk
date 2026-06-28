"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FullScreen } from "@/components/AuthGate";
import { ClaimSeat } from "@/components/ClaimSeat";
import { LeagueChrome } from "@/components/LeagueChrome";

export function LeagueGate({
  leagueId,
  children,
}: {
  leagueId: string;
  children: ReactNode;
}) {
  const league = useQuery(api.leagues.get, {
    leagueId: leagueId as Id<"leagues">,
  });

  if (league === undefined) return <FullScreen>Loading…</FullScreen>;

  const notAllowed = (msg: string) => (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground">{msg}</p>
      <Link href="/" className="text-sm text-primary underline underline-offset-4">
        Back to your Supremacies
      </Link>
    </div>
  );

  if (league === null) return notAllowed("That Supremacy doesn't exist.");

  const me = league.me;
  if (!me.isMember && !me.isSuperAdmin) {
    return notAllowed("You're not in this Supremacy.");
  }

  // Members must claim a seat; a super-admin can peek without one.
  if (me.isMember && !me.player) {
    return <ClaimSeat leagueId={leagueId} leagueName={league.name} />;
  }

  return (
    <LeagueChrome
      leagueId={leagueId}
      leagueName={league.name}
      playerName={me.player}
      peek={!me.isMember}
      isAdmin={me.isAdmin}
    >
      {children}
    </LeagueChrome>
  );
}
