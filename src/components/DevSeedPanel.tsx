"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Dev-only helper to seed/reseed the database (Prompt 1). Rendered on the Admin
// screen in development builds only.
export function DevSeedPanel() {
  const summary = useQuery(api.seed.summary);
  const seedIfEmpty = useMutation(api.seed.seedIfEmpty);
  const reseed = useMutation(api.seed.reseed);
  const [busy, setBusy] = useState<null | "seed" | "reseed">(null);

  const run = async (which: "seed" | "reseed") => {
    setBusy(which);
    try {
      if (which === "seed") await seedIfEmpty({});
      else await reseed({});
    } finally {
      setBusy(null);
    }
  };

  const connected = summary !== undefined;

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">Dev tools · seed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!connected ? (
          <p className="text-muted-foreground">
            Connecting to Convex… (is <span className="font-mono">npx convex dev</span>{" "}
            running and <span className="font-mono">NEXT_PUBLIC_CONVEX_URL</span> set?)
          </p>
        ) : (
          <div className="space-y-1 text-muted-foreground">
            <p>
              Players: <span className="font-mono text-foreground">{summary.players}</span>{" "}
              ({summary.unclaimedPlayers} unclaimed) · Games:{" "}
              <span className="font-mono text-foreground">{summary.games}</span> ·
              Tournaments:{" "}
              <span className="font-mono text-foreground">{summary.tournaments}</span>
            </p>
            {summary.playerNames.length > 0 && (
              <p className="text-xs">{summary.playerNames.join(" · ")}</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!connected || busy !== null}
            onClick={() => run("seed")}
          >
            {busy === "seed" ? "Seeding…" : "Seed if empty"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!connected || busy !== null}
            onClick={() => run("reseed")}
          >
            {busy === "reseed" ? "Reseeding…" : "Reseed (wipe)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
