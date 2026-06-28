"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Check, Copy, Share2 } from "lucide-react";
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
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title: `Join ${league.name} on Supremacy`,
        text: `Join my Supremacy "${league.name}" — World Cup goal-supremacy trading.`,
        url: link,
      });
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold">Invite players</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Share this link so friends can join.
      </p>
      <div className="tnum mt-3 truncate rounded-lg bg-secondary px-3 py-2 text-sm tracking-widest">
        {code}
      </div>
      <div className="mt-2 flex gap-2">
        {canShare && (
          <Button size="sm" className="h-9 flex-1" onClick={share}>
            <Share2 className="size-4" /> Share
          </Button>
        )}
        <Button
          size="sm"
          variant={canShare ? "outline" : "default"}
          className={canShare ? "h-9 flex-1 border-border" : "h-9 flex-1"}
          onClick={copy}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
