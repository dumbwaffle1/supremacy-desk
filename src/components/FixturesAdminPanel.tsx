"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { RefreshCw } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { STAGES, STAGE_LABEL, type Stage } from "@/config/constants";

export function FixturesAdminPanel() {
  const games = useQuery(api.games.list);
  const syncNow = useAction(api.fixtures.syncNow);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = (await syncNow({})) as {
        ok?: boolean;
        error?: string;
        created?: number;
        updated?: number;
        adopted?: number;
        total?: number;
      };
      if (r.ok) {
        setMsg(
          `Synced ${r.total} fixtures · ${r.created} new, ${r.updated} updated, ${r.adopted} adopted.`,
        );
      } else {
        setError(r.error ?? "Sync failed — check Convex logs.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const counts = (games ?? []).reduce<Record<string, number>>((acc, g) => {
    acc[g.stage] = (acc[g.stage] ?? 0) + 1;
    return acc;
  }, {});
  const total = games?.length ?? 0;

  return (
    <div className="panel rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Fixtures</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {games === undefined
              ? "Loading…"
              : `${total} games synced from football-data.org`}
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={busy} className="font-medium">
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-6 gap-1.5">
        {STAGES.map((s: Stage) => (
          <div
            key={s}
            className="rounded-lg bg-secondary px-1 py-2 text-center"
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {STAGE_LABEL[s]}
            </div>
            <div className="tnum mt-0.5 text-sm font-semibold">
              {counts[s] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {msg && <p className="mt-3 text-xs text-up">{msg}</p>}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Auto-syncs twice daily. Remaining API quota is printed in the Convex logs.
      </p>
    </div>
  );
}
