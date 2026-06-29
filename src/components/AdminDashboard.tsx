"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, Bell, BellOff } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useNow } from "@/lib/useNow";
import { colorFor } from "@/config/constants";

type Stats = NonNullable<FunctionReturnType<typeof api.dashboard.stats>>;

function ago(at: number | null, now: number): string {
  if (!at) return "never";
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="panel rounded-xl px-3 py-2.5">
      <div className="tnum text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
        {count !== undefined && <span className="ml-1 text-muted-foreground/60">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

export function AdminDashboard() {
  const data = useQuery(api.dashboard.stats);
  const now = useNow(30000);

  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pb-16 pt-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Home
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Usage</h1>

      {data === undefined ? (
        <div className="mt-4 space-y-3">
          <div className="panel h-20 animate-pulse rounded-2xl" />
          <div className="panel h-40 animate-pulse rounded-2xl" />
        </div>
      ) : data === null ? (
        <p className="mt-6 text-sm text-muted-foreground">Not authorized.</p>
      ) : (
        <Content data={data} now={now} />
      )}
    </div>
  );
}

function Content({ data, now }: { data: Stats; now: number }) {
  const t = data.totals;
  return (
    <div className="mt-4 space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Friends" value={t.users} />
        <Stat label="Active 24h" value={t.activeToday} />
        <Stat label="Leagues" value={t.leagues} />
        <Stat label="Trades" value={t.trades} />
        <Stat label="Push on" value={t.pushOn} />
      </div>

      <Section title="Friends" count={data.friends.length}>
        <ul className="panel divide-y divide-border overflow-hidden rounded-2xl">
          {data.friends.map((f) => (
            <li key={f.userId} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(f.name) }} />
                  <span className="truncate text-sm font-medium">{f.name}</span>
                  {f.pushOn ? (
                    <Bell className="size-3 shrink-0 text-primary" />
                  ) : (
                    <BellOff className="size-3 shrink-0 text-muted-foreground/40" />
                  )}
                </span>
                <span className="tnum shrink-0 text-xs text-muted-foreground">{ago(f.lastActiveAt, now)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 pl-4 text-[11px] text-muted-foreground">
                <span className="truncate">{f.email ?? (f.seats.length ? "" : "no seat")}</span>
                <span className="tnum ml-auto shrink-0">
                  {f.trades} trades · {f.chats} msgs
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {data.unclaimedSeats.length > 0 && (
        <Section title="Unclaimed seats — not onboarded" count={data.unclaimedSeats.length}>
          <ul className="panel divide-y divide-border overflow-hidden rounded-2xl">
            {data.unclaimedSeats.map((s, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.league}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.claimedNoTrades.length > 0 && (
        <Section title="Joined but never traded" count={data.claimedNoTrades.length}>
          <ul className="panel divide-y divide-border overflow-hidden rounded-2xl">
            {data.claimedNoTrades.map((f, i) => (
              <li key={i} className="px-4 py-2 text-sm">
                {f.name}
                {f.email && <span className="ml-2 text-xs text-muted-foreground">{f.email}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Leagues" count={data.leagues.length}>
        <ul className="panel divide-y divide-border overflow-hidden rounded-2xl">
          {data.leagues.map((l) => (
            <li key={l.leagueId} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{l.name}</span>
                <span className="tnum shrink-0 text-xs text-muted-foreground">{ago(l.lastActivityAt, now)}</span>
              </div>
              <div className="tnum mt-0.5 text-[11px] text-muted-foreground">
                {l.seatsClaimed}/{l.seatsTotal} seats · {l.members} members · {l.games} games · {l.trades} trades
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Recent activity">
        <div className="panel divide-y divide-border/40 overflow-hidden rounded-2xl px-1 py-1">
          {data.recent.map((r) => (
            <div key={r._id} className="flex items-baseline gap-1.5 px-2 py-1 text-[12px] leading-snug">
              <span className="shrink-0 font-semibold" style={{ color: colorFor(r.actor) }}>
                {r.actor}
              </span>
              <span className="min-w-0 flex-1 break-words text-muted-foreground">
                {r.kind === "chat"
                  ? r.text
                  : r.kind === "rate"
                    ? `quoted ${r.team} ${r.bid?.toFixed(1)}/${r.offer?.toFixed(1)}`
                    : `${r.side} ${r.team} @ ${r.price?.toFixed(1)}`}{" "}
                <span className="text-[10px] text-muted-foreground/40">· {r.league} · {ago(r.at, now)}</span>
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
