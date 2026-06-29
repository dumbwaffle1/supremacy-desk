"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight, Crown } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { colorFor, STAGE_LABEL, type Stage } from "@/config/constants";
import { displayStatus, STATUS_STYLE } from "@/lib/gameDisplay";
import { Flag } from "@/lib/flags";

/* ── helpers ──────────────────────────────────────────────────────────── */

function gbp(n: number, signed = false): string {
  const sign = n < 0 ? "−" : signed ? "+" : "";
  const v = Math.abs(n);
  const s = Number.isInteger(v) ? v.toString() : v.toFixed(2);
  return `${sign}£${s}`;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

/* ── equity curve ─────────────────────────────────────────────────────── */

type Point = Record<string, number | string>;

function EquityCurve({ leagueId }: { leagueId: Id<"leagues"> }) {
  const data = useQuery(api.standings.equityCurve, { leagueId });

  if (data === undefined) {
    return <div className="panel h-[232px] animate-pulse rounded-2xl" />;
  }

  if (data.settledCount === 0) {
    return (
      <div className="panel flex h-[232px] flex-col items-center justify-center gap-2 rounded-2xl text-center">
        <div className="text-sm font-medium">No settled games yet</div>
        <p className="max-w-[16rem] text-xs text-muted-foreground">
          Your equity curve draws itself after the first final whistle.
        </p>
      </div>
    );
  }

  const players = data.players;
  const points = data.points as Point[];

  return (
    <div className="panel rounded-2xl p-3 pt-4">
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `£${v}`}
            />
            <Tooltip
              contentStyle={{
                background: "#16191d",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--muted-foreground)" }}
              formatter={(value, name) => [gbp(Number(value), true), name as string]}
            />
            {players.map((p) => (
              <Line
                key={p}
                type="monotone"
                dataKey={p}
                stroke={colorFor(p)}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1">
        {players.map((p) => (
          <span key={p} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: colorFor(p) }}
            />
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── standings ────────────────────────────────────────────────────────── */

function Standings({ leagueId }: { leagueId: Id<"leagues"> }) {
  const data = useQuery(api.standings.standings, { leagueId });
  if (data === undefined) {
    return <div className="panel h-40 animate-pulse rounded-2xl" />;
  }

  const live = data.settledCount > 0;
  return (
    <div className="panel overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">Standings</h2>
        <span className="text-[11px] text-muted-foreground">
          {data.settledCount} settled
        </span>
      </div>
      <ul className="divide-y divide-border">
        {data.rows.map((r, i) => (
          <li
            key={r.player}
            className="flex items-center justify-between px-4 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="tnum w-4 text-xs text-muted-foreground">{i + 1}</span>
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: colorFor(r.player) }}
              />
              <span className="text-sm font-medium">{r.player}</span>
              {live && i === 0 && r.pnl !== 0 && (
                <Crown className="size-3.5 text-primary" />
              )}
            </div>
            <span
              className={`tnum text-sm font-semibold ${
                r.pnl > 0 ? "text-up" : r.pnl < 0 ? "text-down" : "text-muted-foreground"
              }`}
            >
              {gbp(r.pnl, true)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── up next ──────────────────────────────────────────────────────────── */

function UpNext({ leagueId }: { leagueId: Id<"leagues"> }) {
  const games = useQuery(api.games.list, { leagueId });
  const now = useNow();

  if (games === undefined) {
    return <div className="panel h-40 animate-pulse rounded-2xl" />;
  }

  const upcoming = games
    .filter((g) => g.status !== "SETTLED" && g.status !== "VOID")
    .sort((a, b) => (a.koUtc ?? Infinity) - (b.koUtc ?? Infinity))
    .slice(0, 3);

  return (
    <div className="panel overflow-hidden rounded-2xl">
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold">Up next</h2>
      </div>
      {upcoming.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">No games scheduled.</p>
      ) : (
        <ul className="divide-y divide-border">
          {upcoming.map((g) => {
            const isLive = g.status === "LIVE";
            const toKo = g.koUtc ? g.koUtc - now : null;
            return (
              <li key={g._id}>
                <Link
                  href={`/l/${leagueId}/games/${g._id}`}
                  className="block px-4 py-3 transition-colors hover:bg-secondary/40"
                >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {STAGE_LABEL[g.stage as Stage]}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Flag name={g.home} />
                      {g.home ?? "TBD"}
                      <span className="text-muted-foreground">v</span>
                      <Flag name={g.away} />
                      {g.away ?? "TBD"}
                    </span>
                  </div>
                  {isLive ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-up">
                      <span className="live-dot size-1.5 rounded-full bg-up" />
                      LIVE
                    </span>
                  ) : (
                    <span className="tnum text-xs text-muted-foreground">
                      {toKo !== null ? countdown(toKo) : "TBD"}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    maker{" "}
                    <span className="text-foreground">{g.makerPlayer ?? "—"}</span>
                  </span>
                  {g.bid !== null ? (
                    <span className="tnum text-muted-foreground">
                      bid{" "}
                      <span className="text-foreground">{g.bid.toFixed(1)}</span> /
                      offer{" "}
                      <span className="text-foreground">{g.offer?.toFixed(1)}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/70">
                      no rate yet
                    </span>
                  )}
                </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── past games ───────────────────────────────────────────────────────── */

function PastGames({ leagueId }: { leagueId: Id<"leagues"> }) {
  const games = useQuery(api.games.list, { leagueId });
  const now = useNow(30000);

  if (games === undefined) {
    return <div className="panel h-40 animate-pulse rounded-2xl" />;
  }

  const past = games
    .filter((g) => g.status === "SETTLED" || g.status === "VOID")
    .sort((a, b) => (b.koUtc ?? 0) - (a.koUtc ?? 0));

  if (past.length === 0) return null;

  return (
    <div className="panel overflow-hidden rounded-2xl">
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold">Past games</h2>
      </div>
      <ul className="divide-y divide-border">
        {past.map((g) => {
          const ds = displayStatus(g.status, g.koUtc, now);
          const settled =
            g.settleHome !== null && g.settleAway !== null
              ? `${g.settleHome}–${g.settleAway}`
              : null;
          return (
            <li key={g._id}>
              <Link
                href={`/l/${leagueId}/games/${g._id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[ds]}`}>
                      {ds}
                    </span>
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <Flag name={g.home} />
                      {g.home ?? "TBD"}
                      <span className="text-muted-foreground">v</span>
                      <Flag name={g.away} />
                      {g.away ?? "TBD"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    maker <span className="text-foreground">{g.makerPlayer ?? "—"}</span>
                    {g.bid !== null && (
                      <span className="tnum">
                        {"  ·  "}
                        {g.quoteTeamName} {g.bid.toFixed(1)} / {g.offer?.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {settled && (
                    <span className="tnum text-sm font-semibold">{settled}</span>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── desk ─────────────────────────────────────────────────────────────── */

export function Desk({ leagueId }: { leagueId: string }) {
  const lid = leagueId as Id<"leagues">;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Desk</h1>
        <p className="text-sm text-muted-foreground">Cumulative P&amp;L · live</p>
      </div>
      <EquityCurve leagueId={lid} />
      <Standings leagueId={lid} />
      <UpNext leagueId={lid} />
      <PastGames leagueId={lid} />
    </div>
  );
}
