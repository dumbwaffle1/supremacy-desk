"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAGES, STAGE_LABEL, type Stage } from "@/config/constants";

export function StakesAdminPanel() {
  const tour = useQuery(api.tournament.get);
  const setStake = useMutation(api.admin.setStake);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savedStage, setSavedStage] = useState<string | null>(null);

  if (tour === undefined) {
    return <div className="panel h-32 animate-pulse rounded-2xl" />;
  }

  const stakes = tour?.stakes;

  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold">Stakes</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">£/goal per stage (applies to new trades).</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {STAGES.map((s: Stage) => {
          const current = stakes?.[s] ?? 0;
          const value = edits[s] ?? String(current);
          const dirty = Number(value) !== current;
          return (
            <div key={s} className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2">
              <span className="w-10 text-xs font-medium text-muted-foreground">
                {STAGE_LABEL[s]}
              </span>
              <Input
                type="number"
                min="0"
                className="h-8"
                value={value}
                onChange={(e) => setEdits((x) => ({ ...x, [s]: e.target.value }))}
              />
              <Button
                size="sm"
                variant={dirty ? "default" : "outline"}
                className="h-8 border-border px-2 text-xs"
                disabled={!dirty || value === ""}
                onClick={async () => {
                  await setStake({ stage: s, amount: Number(value) });
                  setSavedStage(s);
                  setEdits((x) => {
                    const n = { ...x };
                    delete n[s];
                    return n;
                  });
                }}
              >
                {savedStage === s && !dirty ? "✓" : "Save"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
