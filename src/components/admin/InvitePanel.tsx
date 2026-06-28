"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Check, Copy } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

export function InvitePanel({ leagueId }: { leagueId: string }) {
  const league = useQuery(api.leagues.get, {
    leagueId: leagueId as Id<"leagues">,
  });
  const [copied, setCopied] = useState(false);
  const code = league?.inviteCode;
  if (!code) return null;
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${code}`
      : `/join/${code}`;

  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold">Invite players</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Share this link or code so friends can join.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="tnum flex-1 truncate rounded-lg bg-secondary px-3 py-2 text-sm tracking-widest">
          {code}
        </div>
        <Button
          size="sm"
          className="h-9"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked */
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
