"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Send } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNow } from "@/lib/useNow";
import { colorFor } from "@/config/constants";
import { Flag } from "@/lib/flags";

type Entry = FunctionReturnType<typeof api.feed.list>[number];

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/* ── one dense, left-aligned line: "Name: activity/message · time" ─────── */

function FlagTeam({ team }: { team: string | null }) {
  if (!team) return null;
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <Flag name={team} />
      <span className="text-foreground">{team}</span>
    </span>
  );
}

function FeedRow({ e, now }: { e: Entry; now: number }) {
  const name = e.actor ?? "—";
  return (
    <div className="flex items-baseline gap-1.5 px-1 py-[3px] text-[13px] leading-snug">
      <span className="shrink-0 font-semibold" style={{ color: colorFor(name) }}>
        {name}
        <span className="font-normal text-muted-foreground/50">:</span>
      </span>
      <span className="min-w-0 flex-1 break-words text-foreground/90">
        {e.kind === "chat" ? (
          e.text
        ) : e.kind === "rate" ? (
          <span className="text-muted-foreground">
            quoted <FlagTeam team={e.team} />{" "}
            <span className="tnum text-foreground">
              {e.bid?.toFixed(1)} / {e.offer?.toFixed(1)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            <span className={e.side === "BUY" ? "font-semibold text-up" : "font-semibold text-down"}>
              {e.side}
            </span>{" "}
            <FlagTeam team={e.team} /> @{" "}
            <span className="tnum text-foreground">{e.price?.toFixed(1)}</span>
          </span>
        )}{" "}
        <span className="tnum text-[10px] text-muted-foreground/40">{ago(e.at, now)}</span>
      </span>
    </div>
  );
}

/* ── feed ─────────────────────────────────────────────────────────────── */

export function Feed({ leagueId }: { leagueId: string }) {
  const lid = leagueId as Id<"leagues">;
  const entries = useQuery(api.feed.list, { leagueId: lid });
  const league = useQuery(api.leagues.get, { leagueId: lid });
  const post = useMutation(api.feed.post);
  const markSeen = useMutation(api.feed.markSeen);
  const now = useNow(30000);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [kb, setKb] = useState(0); // on-screen keyboard inset (px)
  const scrollRef = useRef<HTMLDivElement>(null);

  const canChat = league?.me.isMember ?? false;
  const count = entries?.length ?? 0;

  // Clear the unread badge while viewing, and as new entries land.
  useEffect(() => {
    if (entries !== undefined) markSeen({ leagueId: lid });
  }, [lid, count, markSeen, entries]);

  // Track the soft keyboard via the VisualViewport so the composer can sit just
  // above it (mobile). No-op on desktop where the viewport doesn't shrink.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKb(inset);
    };
    onChange();
    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    return () => {
      vv.removeEventListener("resize", onChange);
      vv.removeEventListener("scroll", onChange);
    };
  }, []);

  // Keep pinned to the newest message (also when the keyboard opens).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, kb]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await post({ leagueId: lid, text: body });
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>

      <div
        ref={scrollRef}
        className="panel min-h-[30vh] overflow-y-auto rounded-2xl p-3"
        style={{ height: `calc(100dvh - 15rem - ${kb}px)` }}
      >
        {entries === undefined ? (
          <div className="space-y-2">
            <div className="h-8 animate-pulse rounded-lg bg-secondary/60" />
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-secondary/60" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No activity yet. Rates, trades, and chat will show up here.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {entries.map((e) => (
              <FeedRow key={e._id} e={e} now={now} />
            ))}
          </div>
        )}
      </div>

      {canChat ? (
        <div
          className="glass fixed inset-x-0 z-50 border-t border-border bottom-[calc(3.5rem+env(safe-area-inset-bottom))]"
          style={kb > 0 ? { bottom: kb } : undefined}
        >
          <form onSubmit={send} className="mx-auto flex max-w-md items-center gap-2 px-4 py-2">
            <Input
              value={text}
              onChange={(ev) => setText(ev.target.value)}
              placeholder="Message the league…"
              maxLength={500}
              className="h-11"
            />
            <Button type="submit" className="h-11 px-3" disabled={busy || !text.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">Join this league to chat.</p>
      )}
    </div>
  );
}
