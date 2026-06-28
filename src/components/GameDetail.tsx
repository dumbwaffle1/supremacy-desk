"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, Lock, Pencil, ShieldCheck } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WIDTH, STAGE_LABEL, colorFor, type Stage } from "@/config/constants";
import { useNow } from "@/lib/useNow";
import { displayStatus, STATUS_STYLE, supremacy, koLabel } from "@/lib/gameDisplay";

type Detail = NonNullable<FunctionReturnType<typeof api.games.detail>>;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function GameDetail({ gameId }: { gameId: string }) {
  const d = useQuery(api.games.detail, { gameId: gameId as Id<"games"> });
  const now = useNow();

  if (d === undefined) return <div className="panel h-48 animate-pulse rounded-2xl" />;
  if (d === null) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-muted-foreground">Game not found.</p>
      </div>
    );
  }

  const ds = displayStatus(d.status, d.koUtc, now);
  const isSettled = d.status === "SETTLED";

  return (
    <div className="space-y-4">
      <BackLink />

      <div className="panel rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {STAGE_LABEL[d.stage as Stage]} · £{d.stake}/goal
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[ds]}`}>
            {ds}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <Team name={d.home ?? "TBD"} />
          <ScoreOrVs detail={d} />
          <Team name={d.away ?? "TBD"} align="right" />
        </div>

        <div className="mt-3 text-center text-xs text-muted-foreground">
          {koLabel(d.koUtc)} · maker{" "}
          <span className="text-foreground">{d.makerPlayer ?? "—"}</span>
        </div>
      </div>

      <ActionCard detail={d} />
      {d.me.isAdmin && <AdminGameControls detail={d} />}

      {(d.takerOpen || d.makerOpen) && d.stillToTrade.length > 0 && (
        <div className="panel rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Still to trade ({d.stillToTrade.length})
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.stillToTrade.map((p) => (
              <span key={p} className="flex items-center gap-1.5 rounded-full bg-secondary px-2 py-1 text-xs">
                <span className="size-2 rounded-full" style={{ backgroundColor: colorFor(p) }} />
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {d.book.length > 0 && (
        <div className="panel overflow-hidden rounded-2xl">
          <h3 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            The book
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {d.book.map((t) => (
              <li key={t.player} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: colorFor(t.player) }} />
                  {t.player}
                  {t.forcedLong && <span className="text-[10px] text-muted-foreground">(forced)</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className={`tnum text-xs font-semibold ${t.side === "BUY" ? "text-up" : "text-down"}`}>
                    {t.side} {t.priceTaken.toFixed(1)}
                  </span>
                  {isSettled && t.pnl !== null && (
                    <span className={`tnum w-16 text-right font-semibold ${t.pnl > 0 ? "text-up" : t.pnl < 0 ? "text-down" : "text-muted-foreground"}`}>
                      {t.pnl > 0 ? "+" : t.pnl < 0 ? "−" : ""}£{Math.abs(t.pnl)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── shared bits ──────────────────────────────────────────────────────── */

function BackLink() {
  return (
    <Link href="/games" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" /> Games
    </Link>
  );
}

function Team({ name, align }: { name: string; align?: "right" }) {
  return (
    <div className={`min-w-0 flex-1 ${align === "right" ? "text-right" : ""}`}>
      <div className="truncate text-base font-semibold">{name}</div>
    </div>
  );
}

function ScoreOrVs({ detail: d }: { detail: Detail }) {
  if (d.settleHome !== null && d.settleAway !== null) {
    return (
      <div className="text-center">
        <div className="tnum text-2xl font-bold">{d.settleHome}–{d.settleAway}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          S = {supremacy(d.settleHome, d.settleAway)}
        </div>
      </div>
    );
  }
  if (d.liveHome !== null && d.liveAway !== null) {
    return (
      <div className="text-center">
        <div className="tnum text-2xl font-bold text-up">{d.liveHome}–{d.liveAway}</div>
        <div className="text-[10px] uppercase tracking-wide text-up">live</div>
      </div>
    );
  }
  return <span className="text-sm text-muted-foreground">v</span>;
}

function Locked({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel flex items-center gap-2 rounded-2xl p-4 text-sm">
      <Lock className="size-4 shrink-0 text-muted-foreground" />
      <span>{children}</span>
    </div>
  );
}

function Info({ children }: { children: React.ReactNode }) {
  return <div className="panel rounded-2xl p-4 text-sm text-muted-foreground">{children}</div>;
}

/* ── rate input (team perspective + negatives) ────────────────────────── */

function RateInput({
  home,
  away,
  submitLabel,
  onSubmit,
}: {
  home: string | null;
  away: string | null;
  submitLabel: string;
  onSubmit: (homeBid: number) => Promise<void>;
}) {
  const [team, setTeam] = useState<"home" | "away">("home");
  const [bidStr, setBidStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const teamName = (t: "home" | "away") =>
    t === "home" ? (home ?? "Home") : (away ?? "Away");

  const raw = bidStr === "" || bidStr === "-" ? null : Number(bidStr);
  const valid = raw !== null && Number.isFinite(raw);
  const offerFrame = valid ? r2(raw + WIDTH) : null;
  // Convert the chosen team's line to a home-supremacy bid (S = home − away).
  const homeBid = valid ? (team === "home" ? r2(raw) : r2(-(raw + WIDTH))) : null;
  const homeOffer = homeBid !== null ? r2(homeBid + WIDTH) : null;

  const submit = async () => {
    if (homeBid === null) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(homeBid);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {(["home", "away"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(t)}
            className={`truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              team === t ? "bg-background text-foreground" : "text-muted-foreground"
            }`}
          >
            {teamName(t)} over
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.1"
          inputMode="decimal"
          placeholder="line, e.g. 1 or −0.1"
          className="h-11"
          value={bidStr}
          onChange={(e) => setBidStr(e.target.value)}
        />
        <div className="tnum whitespace-nowrap rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
          / {offerFrame !== null ? offerFrame.toFixed(1) : "—"}
        </div>
      </div>

      {homeBid !== null && (
        <p className="text-[11px] text-muted-foreground">
          Home supremacy{" "}
          <span className="tnum text-foreground">
            {homeBid.toFixed(1)} / {homeOffer!.toFixed(1)}
          </span>
          {homeBid + WIDTH / 2 === 0
            ? " · flat — who's over doesn't matter"
            : team === "away"
              ? ` · ${teamName("away")} favoured`
              : ""}
        </p>
      )}

      <Button className="h-11 w-full font-semibold" disabled={busy || homeBid === null} onClick={submit}>
        {busy ? "Saving…" : submitLabel}
      </Button>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}

/* ── role-aware action ────────────────────────────────────────────────── */

function ActionCard({ detail: d }: { detail: Detail }) {
  if (d.me.isMaker) return <MakerAction detail={d} />;
  if (d.me.player === null && !d.me.isAdmin) {
    return (
      <Info>
        <Link href="/" className="underline">Claim a seat</Link> to trade.
      </Info>
    );
  }
  if (d.me.player === null) return null; // admin-only viewer uses admin controls
  return <TakerAction detail={d} />;
}

function MakerAction({ detail: d }: { detail: Detail }) {
  const submitBid = useMutation(api.trades.submitBid);
  const [editing, setEditing] = useState(false);

  const hasRate = d.bid !== null;
  const canEdit = d.makerOpen && !d.hasTrades;

  if (hasRate && !editing) {
    return (
      <div className="panel rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm">
            <Lock className="size-4 shrink-0 text-muted-foreground" />
            <span>
              Your rate — bid <span className="tnum text-foreground">{d.bid!.toFixed(1)}</span> / offer{" "}
              <span className="tnum text-foreground">{d.offer?.toFixed(1)}</span>
              {d.defaultedMaker && <span className="text-muted-foreground"> (auto)</span>}
            </span>
          </span>
          {canEdit && (
            <Button size="sm" variant="outline" className="border-border" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Amend
            </Button>
          )}
        </div>
        {d.hasTrades && (
          <p className="mt-2 text-xs text-muted-foreground">Locked — someone has traded.</p>
        )}
      </div>
    );
  }

  if (!hasRate && !d.makerOpen) {
    return (
      <Info>
        The maker window has closed. A default of <span className="tnum">0.0 / 0.2</span> applies at kick-off.
      </Info>
    );
  }

  return (
    <div className="panel rounded-2xl p-5">
      <h3 className="text-sm font-semibold">You&apos;re the maker</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Quote a two-way price (width {WIDTH}). Pick which team you&apos;re quoting over;
        negatives are fine (−0.1 / 0.1 = flat). Amendable until someone trades.
      </p>
      <div className="mt-3">
        <RateInput
          home={d.home}
          away={d.away}
          submitLabel={hasRate ? "Update rate" : "Submit rate"}
          onSubmit={async (homeBid) => {
            await submitBid({ gameId: d._id, bid: homeBid });
            setEditing(false);
          }}
        />
      </div>
    </div>
  );
}

function TakerAction({ detail: d }: { detail: Detail }) {
  const submitTrade = useMutation(api.trades.submitTrade);
  const [pending, setPending] = useState<"BUY" | "SELL" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (d.me.trade) {
    const t = d.me.trade;
    return (
      <Locked>
        Your position —{" "}
        <span className={t.side === "BUY" ? "text-up" : "text-down"}>
          {t.side} @ {t.priceTaken.toFixed(1)}
        </span>
        {t.forcedLong && <span className="text-muted-foreground"> (forced long)</span>}
        {t.pnl !== null && (
          <span className={`tnum ml-1 font-semibold ${t.pnl > 0 ? "text-up" : t.pnl < 0 ? "text-down" : ""}`}>
            · {t.pnl > 0 ? "+" : t.pnl < 0 ? "−" : ""}£{Math.abs(t.pnl)}
          </span>
        )}
      </Locked>
    );
  }
  if (d.bid === null) return <Info>Waiting for {d.makerPlayer ?? "the maker"} to quote a rate.</Info>;
  if (!d.takerOpen) return <Info>Trading is closed — kick-off has passed.</Info>;

  const price = pending === "BUY" ? d.offer : pending === "SELL" ? d.bid : null;
  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setErr(null);
    try {
      await submitTrade({ gameId: d._id, side: pending });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <div className="panel rounded-2xl p-5">
      <h3 className="text-sm font-semibold">Trade</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        BUY backs the home margin, SELL backs away. One action, then locked.
      </p>

      {pending ? (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg bg-secondary p-3 text-center text-sm">
            Confirm <span className={pending === "BUY" ? "text-up" : "text-down"}>{pending}</span> @{" "}
            <span className="tnum">{price?.toFixed(1)}</span> · £{d.stake}/goal
          </div>
          <div className="flex gap-2">
            <Button className="h-11 flex-1 font-semibold" disabled={busy} onClick={confirm}>
              {busy ? "Placing…" : "Confirm"}
            </Button>
            <Button variant="outline" className="h-11 border-border" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => setPending("BUY")} className="rounded-xl bg-up/15 py-3 text-center transition-colors hover:bg-up/25">
            <div className="text-sm font-semibold text-up">BUY</div>
            <div className="tnum text-xs text-muted-foreground">@ {d.offer?.toFixed(1)}</div>
          </button>
          <button onClick={() => setPending("SELL")} className="rounded-xl bg-down/15 py-3 text-center transition-colors hover:bg-down/25">
            <div className="text-sm font-semibold text-down">SELL</div>
            <div className="tnum text-xs text-muted-foreground">@ {d.bid.toFixed(1)}</div>
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </div>
  );
}

/* ── inline admin override ────────────────────────────────────────────── */

function AdminGameControls({ detail: d }: { detail: Detail }) {
  const overrideBid = useMutation(api.admin.overrideMakerBid);
  const overrideTrade = useMutation(api.admin.overrideTrade);
  const removeTrade = useMutation(api.admin.removeTrade);
  const players = useQuery(api.players.list);
  const [err, setErr] = useState<string | null>(null);

  const sideOf = (p: string) => d.book.find((b) => b.player === p)?.side ?? null;
  const wrap = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    }
  };

  return (
    <div className="panel rounded-2xl p-5 ring-1 ring-primary/20">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        <ShieldCheck className="size-4" /> Admin override
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Set anyone&apos;s rate or trade — bypasses deadlines &amp; locks. Audited.
      </p>

      <div className="mt-3">
        <RateInput
          home={d.home}
          away={d.away}
          submitLabel="Set rate (admin)"
          onSubmit={async (homeBid) => {
            await overrideBid({ gameId: d._id, bid: homeBid });
          }}
        />
      </div>

      {d.bid !== null && (
        <div className="mt-4 space-y-1.5">
          {(players ?? [])
            .filter((p) => p.name !== d.makerPlayer)
            .map((p) => {
              const side = sideOf(p.name);
              return (
                <div key={p._id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: colorFor(p.name) }} />
                    {p.name}
                  </span>
                  <div className="flex items-center gap-1">
                    {(["BUY", "SELL"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => wrap(() => overrideTrade({ gameId: d._id, player: p.name, side: s }))}
                        className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                          side === s
                            ? s === "BUY"
                              ? "bg-up/20 text-up"
                              : "bg-down/20 text-down"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                    <button
                      disabled={side === null}
                      onClick={() => wrap(() => removeTrade({ gameId: d._id, player: p.name }))}
                      className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      clear
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}
      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
    </div>
  );
}
