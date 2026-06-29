"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronRight } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { STAGE_LABEL, type Stage } from "@/config/constants";
import { useNow } from "@/lib/useNow";
import { displayStatus, STATUS_STYLE } from "@/lib/gameDisplay";
import { Flag } from "@/lib/flags";

type TodoData = FunctionReturnType<typeof api.games.todo>;
type TodoItem = TodoData["todo"][number];
type PositionItem = TodoData["positions"][number];
type RowBase = TodoItem;

function gbp(n: number): string {
  const sign = n < 0 ? "−" : "+";
  const v = Math.abs(n);
  return `${sign}£${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

/* ── shared left side (mirrors the Games-tab row) ─────────────────────── */

function RowLeft({ item, now }: { item: RowBase | PositionItem; now: number }) {
  const ds = displayStatus(item.status, item.koUtc, now);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[ds]}`}>
          {ds}
        </span>
        <span className="flex items-center gap-1.5 truncate text-sm font-medium">
          <Flag name={item.home} />
          {item.home ?? "TBD"}
          <span className="text-muted-foreground">v</span>
          <Flag name={item.away} />
          {item.away ?? "TBD"}
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        <span className="rounded bg-secondary px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
          {STAGE_LABEL[item.stage as Stage]}
        </span>{" "}
        maker <span className="text-foreground">{item.makerPlayer ?? "—"}</span>
        {item.bid !== null && (
          <span className="tnum">
            {"  ·  "}
            {item.quoteTeamName} {item.bid.toFixed(1)} / {item.offer?.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── inline BUY/SELL with a confirm step (ported from GameDetail) ─────── */

function TradeButtons({ item }: { item: TodoItem }) {
  const submitTrade = useMutation(api.trades.submitTrade);
  const [pending, setPending] = useState<"BUY" | "SELL" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const team = item.quoteTeamName;
  const price = pending === "BUY" ? item.offer : pending === "SELL" ? item.bid : null;

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setErr(null);
    try {
      await submitTrade({ gameId: item.gameId, side: pending });
      // Convex reactivity moves the row to "Your positions" on success.
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
      setPending(null);
    }
  };

  if (pending) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-[11px] text-muted-foreground">
          <span className={pending === "BUY" ? "text-up" : "text-down"}>
            {pending} {team}
          </span>{" "}
          @ <span className="tnum">{price?.toFixed(1)}</span>
        </span>
        <div className="flex gap-1.5">
          <Button size="sm" className="h-8 px-3" disabled={busy} onClick={confirm}>
            {busy ? "…" : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-border px-2.5"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            Cancel
          </Button>
        </div>
        {err && <p className="max-w-[10rem] text-right text-[11px] text-destructive">{err}</p>}
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <button
        onClick={() => setPending("BUY")}
        className="rounded-lg bg-up/15 px-2.5 py-1.5 text-center transition-colors hover:bg-up/25"
      >
        <div className="text-xs font-semibold text-up">BUY</div>
        <div className="tnum text-[10px] text-muted-foreground">{item.offer?.toFixed(1)}</div>
      </button>
      <button
        onClick={() => setPending("SELL")}
        className="rounded-lg bg-down/15 px-2.5 py-1.5 text-center transition-colors hover:bg-down/25"
      >
        <div className="text-xs font-semibold text-down">SELL</div>
        <div className="tnum text-[10px] text-muted-foreground">{item.bid?.toFixed(1)}</div>
      </button>
    </div>
  );
}

/* ── right side of a position row ─────────────────────────────────────── */

function PositionRight({ item }: { item: PositionItem }) {
  if (item.kind === "POSITION") {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className={`text-xs font-semibold ${item.mySide === "BUY" ? "text-up" : "text-down"}`}>
          {item.mySide} @ <span className="tnum">{item.myPrice.toFixed(1)}</span>
        </span>
        {item.forcedLong && <span className="text-[10px] text-muted-foreground">forced</span>}
        {item.livePnl !== null && (
          <span className={`tnum text-xs font-semibold ${item.livePnl > 0 ? "text-up" : item.livePnl < 0 ? "text-down" : "text-muted-foreground"}`}>
            {gbp(item.livePnl)}
          </span>
        )}
      </div>
    );
  }
  // MAKER_BOOK
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-xs font-semibold">
        <span className="text-up">▲ {item.longs}</span>{" "}
        <span className="text-down">▼ {item.shorts}</span>
      </span>
      {item.livePnl !== null ? (
        <span className={`tnum text-xs font-semibold ${item.livePnl > 0 ? "text-up" : item.livePnl < 0 ? "text-down" : "text-muted-foreground"}`}>
          {gbp(item.livePnl)}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground">maker · book</span>
      )}
    </div>
  );
}

/* ── tab ──────────────────────────────────────────────────────────────── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

export function Todo({ leagueId }: { leagueId: string }) {
  const lid = leagueId as Id<"leagues">;
  const data = useQuery(api.games.todo, { leagueId: lid });
  const now = useNow(30000);

  if (data === undefined) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">To-do</h1>
        <div className="panel h-24 animate-pulse rounded-2xl" />
        <div className="panel h-24 animate-pulse rounded-2xl" />
      </div>
    );
  }

  const { player, todo, positions } = data;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">To-do</h1>

      {player === null ? (
        <div className="panel rounded-2xl p-5 text-sm text-muted-foreground">
          Claim a seat to see your rates to make, trades to place, and live positions.
        </div>
      ) : todo.length === 0 && positions.length === 0 ? (
        <div className="panel rounded-2xl p-6 text-center">
          <p className="text-sm font-medium">You&apos;re all caught up</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No rates to make, nothing to trade, and no open positions right now.
          </p>
        </div>
      ) : (
        <>
          {todo.length > 0 && (
            <section className="space-y-2">
              <SectionHeader>To do ({todo.length})</SectionHeader>
              <ul className="panel divide-y divide-border overflow-hidden rounded-2xl">
                {todo.map((item) => (
                  <li key={item.gameId} className="flex items-center gap-3 px-4 py-3">
                    <RowLeft item={item} now={now} />
                    <div className="shrink-0">
                      {item.kind === "MAKE_RATE" ? (
                        <Link href={`/l/${leagueId}/games/${item.gameId}`}>
                          <Button size="sm" className="h-9 px-3 font-semibold">
                            Make rate
                          </Button>
                        </Link>
                      ) : (
                        <TradeButtons item={item} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {positions.length > 0 && (
            <section className="space-y-2">
              <SectionHeader>Your positions ({positions.length})</SectionHeader>
              <ul className="panel divide-y divide-border overflow-hidden rounded-2xl">
                {positions.map((item) => (
                  <li key={item.gameId}>
                    <Link
                      href={`/l/${leagueId}/games/${item.gameId}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                    >
                      <RowLeft item={item} now={now} />
                      <PositionRight item={item} />
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
