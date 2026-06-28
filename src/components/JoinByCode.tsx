"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Trophy, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";

export function JoinByCode({ code }: { code: string }) {
  const preview = useQuery(api.leagues.byInvite, { inviteCode: code });
  const join = useMutation(api.leagues.join);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="mb-6 flex justify-center">
        <BrandMark className="size-11 rounded-xl" />
      </div>

      {preview === undefined ? (
        <div className="panel h-32 animate-pulse rounded-2xl" />
      ) : preview === null ? (
        <div className="panel rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            That invite link isn&apos;t valid.
          </p>
          <Link href="/" className="mt-3 inline-block text-sm text-primary underline">
            Go home
          </Link>
        </div>
      ) : (
        <div className="panel rounded-2xl p-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-secondary">
            <Trophy className="size-6 text-primary" />
          </div>
          <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
            You&apos;re invited to
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{preview.name}</h1>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-3.5" /> {preview.playerCount} players · WC2026
          </p>
          <Button
            className="mt-5 h-11 w-full font-semibold"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { leagueId } = await join({ inviteCode: code });
                router.push(`/l/${leagueId}`);
              } catch {
                setBusy(false);
              }
            }}
          >
            {busy ? "Joining…" : "Join this Supremacy"}
          </Button>
        </div>
      )}
    </div>
  );
}
