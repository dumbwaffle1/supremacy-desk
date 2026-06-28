"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Dice5, Eraser, ListOrdered, Lock, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { STAGES, STAGE_LABEL, type Stage } from "@/config/constants";
import { useNow } from "@/lib/useNow";
import { displayStatus, STATUS_STYLE } from "@/lib/gameDisplay";

type Game = FunctionReturnType<typeof api.games.list>[number];

const EDITABLE = ["R32", "R16"];
const stageIdx = (s: string) => STAGES.indexOf(s as Stage);
const byStageThenNo = (a: Game, b: Game) =>
  stageIdx(a.stage) - stageIdx(b.stage) || a.gameNo - b.gameNo;

function StageTag({ stage }: { stage: string }) {
  return (
    <span className="w-7 shrink-0 rounded bg-secondary px-1 py-0.5 text-center text-[9px] font-semibold uppercase text-muted-foreground">
      {STAGE_LABEL[stage as Stage]}
    </span>
  );
}

export function MakerDrawPanel({ leagueId }: { leagueId: string }) {
  const lid = leagueId as Id<"leagues">;
  const games = useQuery(api.games.list, { leagueId: lid });
  const players = useQuery(api.players.list, { leagueId: lid });
  const assignMakers = useMutation(api.admin.assignMakers);
  const now = useNow(30000);

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (games === undefined || players === undefined) {
    return <div className="panel h-32 animate-pulse rounded-2xl" />;
  }

  const roster = players.map((p) => p.name);
  const locked = (g: Game) =>
    !(g.status === "SCHEDULED" && (g.koUtc === null || g.koUtc > now));

  const upcoming = games.filter((g) => !locked(g)).sort(byStageThenNo);
  const editable = upcoming.filter((g) => EDITABLE.includes(g.stage)); // R32/R16
  const auto = upcoming.filter((g) => !EDITABLE.includes(g.stage)); // QF onwards
  const past = games.filter((g) => locked(g)).sort(byStageThenNo);
  const valOf = (g: Game) => assign[g._id] ?? g.makerPlayer ?? "";

  const fillRandom = () => {
    const next = { ...assign };
    for (const stage of [...new Set(editable.map((g) => g.stage))]) {
      const count = new Map(roster.map((p) => [p, 0]));
      for (const g of games.filter((g) => g.stage === stage)) {
        const m = next[g._id] ?? g.makerPlayer ?? "";
        if (m && count.has(m)) count.set(m, (count.get(m) ?? 0) + 1);
      }
      for (const g of editable.filter((g) => g.stage === stage)) {
        if (next[g._id] ?? g.makerPlayer ?? "") continue;
        let best = roster[0];
        for (const p of roster)
          if ((count.get(p) ?? 0) < (count.get(best) ?? 0)) best = p;
        next[g._id] = best;
        count.set(best, (count.get(best) ?? 0) + 1);
      }
    }
    setAssign(next);
    setMsg(null);
  };

  const fillOrder = () => {
    if (!roster.length) return;
    const next = { ...assign };
    for (const stage of [...new Set(editable.map((g) => g.stage))]) {
      const stageGames = games
        .filter((g) => g.stage === stage)
        .sort((a, b) => a.gameNo - b.gameNo);
      stageGames.forEach((g, i) => {
        if (locked(g) || (next[g._id] ?? g.makerPlayer ?? "")) return;
        next[g._id] = roster[i % roster.length];
      });
    }
    setAssign(next);
    setMsg(null);
  };

  const clearAll = () => {
    const next = { ...assign };
    for (const g of editable) next[g._id] = "";
    setAssign(next);
    setMsg(null);
  };

  const lock = async () => {
    const assignments = editable.map((g) => ({
      gameId: g._id as Id<"games">,
      player: valOf(g),
    }));
    setBusy(true);
    setMsg(null);
    try {
      const r = await assignMakers({ leagueId: lid, assignments });
      setMsg(`Locked — ${r.count} game${r.count === 1 ? "" : "s"} set.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold">Maker draw</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Set R32/R16 here. QF onwards auto-track standings (bottom 4 → QF; top 4 →
        Final, 3rd, semis) — override per game on its page.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
              tab === t ? "bg-background text-foreground" : "text-muted-foreground"
            }`}
          >
            {t} ({t === "upcoming" ? upcoming.length : past.length})
          </button>
        ))}
      </div>

      {tab === "past" ? (
        <ul className="mt-3 space-y-1.5">
          {past.length === 0 ? (
            <li className="py-2 text-center text-xs text-muted-foreground">No past games.</li>
          ) : (
            past.map((g) => {
              const ds = displayStatus(g.status, g.koUtc, now);
              return (
                <li key={g._id} className="flex items-center gap-2">
                  <StageTag stage={g.stage} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {g.home ?? "TBD"} v {g.away ?? "TBD"}
                  </span>
                  <span className="text-xs">{g.makerPlayer ?? "—"}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLE[ds]}`}>
                    {ds}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      ) : (
        <>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" variant="outline" className="h-8 flex-1 border-border px-1.5 text-[11px]" onClick={fillRandom}>
              <Dice5 className="size-3.5" /> Fill randomly
            </Button>
            <Button size="sm" variant="outline" className="h-8 flex-1 border-border px-1.5 text-[11px]" onClick={fillOrder}>
              <ListOrdered className="size-3.5" /> By roster
            </Button>
            <Button size="sm" variant="outline" className="h-8 border-border px-2" onClick={clearAll}>
              <Eraser className="size-3.5" />
            </Button>
          </div>

          <ul className="mt-3 space-y-1.5">
            {editable.length === 0 ? (
              <li className="py-2 text-center text-xs text-muted-foreground">
                No upcoming R32/R16 games.
              </li>
            ) : (
              editable.map((g) => (
                <li key={g._id} className="flex items-center gap-2">
                  <StageTag stage={g.stage} />
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
              ))
            )}
          </ul>

          {editable.length > 0 && (
            <Button className="mt-3 h-10 w-full font-semibold" disabled={busy} onClick={lock}>
              <Lock className="size-4" /> {busy ? "Locking…" : "Lock R32/R16"}
            </Button>
          )}

          {auto.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                QF onwards · auto from standings
              </p>
              <ul className="mt-2 space-y-1.5">
                {auto.map((g) => (
                  <li key={g._id} className="flex items-center gap-2">
                    <StageTag stage={g.stage} />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {g.home ?? "TBD"} v {g.away ?? "TBD"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {g.makerPlayer ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {msg && <p className="mt-2 text-xs text-up">{msg}</p>}
    </div>
  );
}
