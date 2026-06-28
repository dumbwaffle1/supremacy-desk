"use client";

import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Gate league-admin (owner) content. Server mutations are separately guarded. */
export function AdminOnly({
  leagueId,
  children,
}: {
  leagueId: string;
  children: ReactNode;
}) {
  const league = useQuery(api.leagues.get, {
    leagueId: leagueId as Id<"leagues">,
  });
  if (league === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!league?.me.isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          This area is for the league owner only.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
