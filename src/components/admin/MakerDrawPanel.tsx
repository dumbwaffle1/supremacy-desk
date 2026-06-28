"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Dice5, Lock } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { type Stage } from "@/config/constants";

const DRAWS = [
  { key: "R32", label: "R32 · section 2", stages: ["R32"] },
  { key: "R16", label: "R16", stages: ["R16"] },
  { key: "QF", label: "QF · bottom 4", stages: ["QF"] },
  { key: "F4", label: "Final four · SF·3PO·F", stages: ["SF", "3PO", "F"] },
] as const;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Game = FunctionReturnType<typeof api.games.list>[number];

export function MakerDrawPanel({ leagueId }: { leagueId: string }) {
  const lid = leagueId as Id<"leagues">;
  const games = useQuery(api.games.list, { leagueId: lid });
  const standings = useQuery(api.standings.standings, { leagueId: lid });
  const players = useQuery(api.players.list, { leagueId: lid });
  const assignMakers = useMutation(api.admin.assignMakers);

  const [drawKey, setDrawKey] = useState<(typeof DRAWS)[number]["key"]>("R32");
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (games === undefined || standings === undefined || players === undefined) {
    return <div className="panel h-32 animate-pulse rounded-2xl" />;
  }

  const draw = DRAWS.find((d) => d.key === drawKey)!;
  const roster = players.map((p) => p.name);
  const order = standings.rows.map((r) => r.player); // best → worst
  const drawStages = draw.stages as readonly Stage[];
  const stageGames = games
    .filter((g) => drawStages.includes(g.stage as Stage))
    .sort((a, b) => a.gameNo - b.gameNo);

  const propose = () => {
    const next: Record<string, string> = {};
    if (drawKey === "R32") {
      const pool = shuffle(roster);
      let i = 0;
      for (const g of stageGames) {
        next[g._id] = g.makerPlayer ?? pool[i++ % pool.length];
      }
    } else if (drawKey === "R16") {
      const pool = shuffle(roster);
      stageGames.forEach((g, i) => (next[g._id] = pool[i % pool.length]));
    } else if (drawKey === "QF") {
      const bottom4 = order.slice(-4);
      stageGames.forEach((g, i) => (next[g._id] = bottom4[i % bottom4.length] ?? ""));
    } else {
      const qfMakers = new Set(
        games.filter((g) => g.stage === "QF").map((g) => g.makerPlayer),
      );
      let remaining = roster.filter((p) => !qfMakers.has(p));
      if (remaining.length !== 4) remaining = order.slice(0, 4);
      remaining = order.filter((p) => remaining.includes(p)); // by standing
      stageGames.forEach((g, i) => (next[g._id] = remaining[i % remaining.length] ?? ""));
    }
    setAssign(next);
    setMsg(null);
  };

  const lock = async () => {
    const assignments = stageGames
      .map((g) => ({ gameId: g._id as Id<"games">, player: assign[g._id] }))
      .filter((a) => a.player);
    if (assignments.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await assignMakers({ leagueId: lid, assignments });
      setMsg(`Locked ${r.count} maker assignment${r.count === 1 ? "" : "s"}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold">Maker draw</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Propose per the stage rules, tweak, then lock.
      </p>

      <div className="mt-3 flex gap-2">
        <select
          value={drawKey}
          onChange={(e) => {
            setDrawKey(e.target.value as typeof drawKey);
            setAssign({});
            setMsg(null);
          }}
          className="h-9 flex-1 rounded-lg border border-input bg-secondary px-3 text-sm"
        >
          {DRAWS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" className="h-9 border-border" onClick={propose}>
          <Dice5 className="size-4" /> Propose
        </Button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {stageGames.map((g: Game) => (
          <li key={g._id} className="flex items-center gap-2">
            <span className="w-6 text-xs text-muted-foreground">#{g.gameNo}</span>
            <span className="min-w-0 flex-1 truncate text-xs">
              {g.home ?? "TBD"} v {g.away ?? "TBD"}
            </span>
            <select
              value={assign[g._id] ?? g.makerPlayer ?? ""}
              onChange={(e) => setAssign((a) => ({ ...a, [g._id]: e.target.value }))}
              className="h-8 w-28 rounded-md border border-input bg-secondary px-2 text-xs"
            >
              <option value="">—</option>
              {roster.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <Button className="mt-3 h-10 w-full font-semibold" disabled={busy} onClick={lock}>
        <Lock className="size-4" /> {busy ? "Locking…" : "Lock assignments"}
      </Button>
      {msg && <p className="mt-2 text-xs text-up">{msg}</p>}
    </div>
  );
}
