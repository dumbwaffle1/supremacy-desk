"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Dice5, Eraser, ListOrdered, Lock, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { type Stage } from "@/config/constants";

const DRAWS = [
  { key: "R32", label: "R32", stages: ["R32"] },
  { key: "R16", label: "R16", stages: ["R16"] },
  { key: "QF", label: "QF · bottom 4", stages: ["QF"] },
  { key: "F4", label: "Final four · SF·3PO·F", stages: ["SF", "3PO", "F"] },
] as const;

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
  const roster = players.map((p) => p.name); // join order (≈ spreadsheet order)
  const order = standings.rows.map((r) => r.player); // best → worst
  const drawStages = draw.stages as readonly Stage[];
  const stageGames = games
    .filter((g) => drawStages.includes(g.stage as Stage))
    .sort((a, b) => a.gameNo - b.gameNo);

  const valOf = (g: Game) => assign[g._id] ?? g.makerPlayer ?? "";

  const poolFor = (): string[] => {
    if (drawKey === "QF") return order.slice(-4); // bottom 4 by P&L
    if (drawKey === "F4") {
      const qfMakers = new Set(
        games.filter((g) => g.stage === "QF").map((g) => g.makerPlayer).filter(Boolean),
      );
      let rem = roster.filter((p) => !qfMakers.has(p));
      if (rem.length !== 4) rem = order.slice(0, 4);
      return order.filter((p) => rem.includes(p)); // remaining 4, by standing
    }
    return roster;
  };

  // Fill only the blanks, giving each game to the least-used pool player so
  // everyone makes roughly the same number of games.
  const propose = () => {
    const pool = poolFor();
    if (pool.length === 0) return;
    const next = { ...assign };
    const count = new Map(pool.map((p) => [p, 0]));
    for (const g of stageGames) {
      const m = next[g._id] ?? g.makerPlayer ?? "";
      if (m && count.has(m)) count.set(m, (count.get(m) ?? 0) + 1);
    }
    for (const g of stageGames) {
      const cur = next[g._id] ?? g.makerPlayer ?? "";
      if (cur) continue;
      let best = pool[0];
      for (const p of pool) if ((count.get(p) ?? 0) < (count.get(best) ?? 0)) best = p;
      next[g._id] = best;
      count.set(best, (count.get(best) ?? 0) + 1);
    }
    setAssign(next);
    setMsg(null);
  };

  const rosterOrder = () => {
    const next = { ...assign };
    stageGames.forEach((g, i) => (next[g._id] = roster[i % roster.length] ?? ""));
    setAssign(next);
    setMsg(null);
  };

  const clearAll = () => {
    const next = { ...assign };
    stageGames.forEach((g) => (next[g._id] = ""));
    setAssign(next);
    setMsg(null);
  };

  const lock = async () => {
    const assignments = stageGames.map((g) => ({
      gameId: g._id as Id<"games">,
      player: valOf(g),
    }));
    setBusy(true);
    setMsg(null);
    try {
      const r = await assignMakers({ leagueId: lid, assignments });
      setMsg(`Locked — ${r.count} game${r.count === 1 ? "" : "s"} have a maker.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold">Maker draw</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        R32/R16 random &amp; even; QF = bottom 4 by P&amp;L; final four = remaining 4 by
        standing. Tweak, then lock.
      </p>

      <select
        value={drawKey}
        onChange={(e) => {
          setDrawKey(e.target.value as typeof drawKey);
          setAssign({});
          setMsg(null);
        }}
        className="mt-3 h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm"
      >
        {DRAWS.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>

      <div className="mt-2 flex gap-1.5">
        <Button size="sm" variant="outline" className="h-8 flex-1 border-border" onClick={propose}>
          <Dice5 className="size-3.5" /> Propose
        </Button>
        <Button size="sm" variant="outline" className="h-8 flex-1 border-border" onClick={rosterOrder}>
          <ListOrdered className="size-3.5" /> Order
        </Button>
        <Button size="sm" variant="outline" className="h-8 flex-1 border-border" onClick={clearAll}>
          <Eraser className="size-3.5" /> Clear
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
              value={valOf(g)}
              onChange={(e) => setAssign((a) => ({ ...a, [g._id]: e.target.value }))}
              className="h-8 w-24 rounded-md border border-input bg-secondary px-2 text-xs"
            >
              <option value="">—</option>
              {roster.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAssign((a) => ({ ...a, [g._id]: "" }))}
              disabled={!valOf(g)}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive disabled:opacity-30"
              aria-label="Clear maker"
            >
              <X className="size-3.5" />
            </button>
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
