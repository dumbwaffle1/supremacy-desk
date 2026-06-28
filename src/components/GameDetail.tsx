"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, Lock } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WIDTH, STAGE_LABEL, colorFor, type Stage } from "@/config/constants";
import { useNow } from "@/lib/useNow";
import {
  displayStatus,
  STATUS_STYLE,
  supremacy,
  koLabel,
} from "@/lib/gameDisplay";

type Detail = NonNullable<FunctionReturnType<typeof api.games.detail>>;

export function GameDetail({ gameId }: { gameId: string }) {
  const d = useQuery(api.games.detail, { gameId: gameId as Id<"games"> });
  const now = useNow();

  if (d === undefined) {
    return <div className="panel h-48 animate-pulse rounded-2xl" />;
  }
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

      {/* Match header */}
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

      {/* Role-aware action */}
      <ActionCard detail={d} />

      {/* Book + still-to-trade */}
      {(d.takerOpen || d.makerOpen) && d.stillToTrade.length > 0 && (
        <div className="panel rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Still to trade ({d.stillToTrade.length})
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.stillToTrade.map((p) => (
              <span
                key={p}
                className="flex items-center gap-1.5 rounded-full bg-secondary px-2 py-1 text-xs"
              >
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
              <li
                key={t.player}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: colorFor(t.player) }} />
                  {t.player}
                  {t.forcedLong && (
                    <span className="text-[10px] text-muted-foreground">(forced)</span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span
                    className={`tnum text-xs font-semibold ${
                      t.side === "BUY" ? "text-up" : "text-down"
                    }`}
                  >
                    {t.side} {t.priceTaken.toFixed(1)}
                  </span>
                  {isSettled && t.pnl !== null && (
                    <span
                      className={`tnum w-16 text-right font-semibold ${
                        t.pnl > 0 ? "text-up" : t.pnl < 0 ? "text-down" : "text-muted-foreground"
                      }`}
                    >
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

function BackLink() {
  return (
    <Link
      href="/games"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
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
  const settled = d.settleHome !== null && d.settleAway !== null;
  const live = d.liveHome !== null && d.liveAway !== null;
  if (settled) {
    return (
      <div className="text-center">
        <div className="tnum text-2xl font-bold">
          {d.settleHome}–{d.settleAway}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          S = {supremacy(d.settleHome!, d.settleAway!)}
        </div>
      </div>
    );
  }
  if (live) {
    return (
      <div className="text-center">
        <div className="tnum text-2xl font-bold text-up">
          {d.liveHome}–{d.liveAway}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-up">live</div>
      </div>
    );
  }
  return <span className="text-sm text-muted-foreground">v</span>;
}

/* ── role-aware action card ───────────────────────────────────────────── */

function ActionCard({ detail: d }: { detail: Detail }) {
  if (d.me.player === null) {
    return (
      <Info>
        <Link href="/" className="underline">
          Claim a seat
        </Link>{" "}
        to trade.
      </Info>
    );
  }
  if (d.me.isMaker) return <MakerAction detail={d} />;
  return <TakerAction detail={d} />;
}

function MakerAction({ detail: d }: { detail: Detail }) {
  const submitBid = useMutation(api.trades.submitBid);
  const [bid, setBid] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (d.bid !== null) {
    return (
      <Locked>
        Your rate is in — bid{" "}
        <span className="tnum text-foreground">{d.bid.toFixed(1)}</span> / offer{" "}
        <span className="tnum text-foreground">{d.offer?.toFixed(1)}</span>
        {d.defaultedMaker && (
          <span className="text-muted-foreground"> (auto-defaulted)</span>
        )}
      </Locked>
    );
  }
  if (!d.makerOpen) {
    return (
      <Info>
        The maker window has closed. A default rate of{" "}
        <span className="tnum">0.0 / 0.2</span> will be applied at kick-off.
      </Info>
    );
  }

  const parsed = bid === "" ? null : Number(bid);
  const offerPreview =
    parsed !== null && Number.isFinite(parsed)
      ? Math.round((parsed + WIDTH) * 100) / 100
      : null;

  const submit = async () => {
    if (parsed === null) return;
    setBusy(true);
    setErr(null);
    try {
      await submitBid({ gameId: d._id, bid: parsed });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel rounded-2xl p-5">
      <h3 className="text-sm font-semibold">You&apos;re the maker</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Quote a bid on home supremacy. Offer is bid + {WIDTH}. Locked once submitted.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Input
          type="number"
          step="0.1"
          inputMode="decimal"
          placeholder="bid"
          className="h-11"
          value={bid}
          onChange={(e) => setBid(e.target.value)}
        />
        <div className="tnum whitespace-nowrap rounded-lg bg-secondary px-3 py-2 text-sm">
          offer {offerPreview !== null ? offerPreview.toFixed(1) : "—"}
        </div>
      </div>
      <Button
        className="mt-3 h-11 w-full font-semibold"
        disabled={busy || parsed === null}
        onClick={submit}
      >
        {busy ? "Submitting…" : "Submit rate"}
      </Button>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
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
          <span
            className={`tnum ml-1 font-semibold ${
              t.pnl > 0 ? "text-up" : t.pnl < 0 ? "text-down" : ""
            }`}
          >
            · {t.pnl > 0 ? "+" : t.pnl < 0 ? "−" : ""}£{Math.abs(t.pnl)}
          </span>
        )}
      </Locked>
    );
  }
  if (d.bid === null) {
    return <Info>Waiting for {d.makerPlayer ?? "the maker"} to quote a rate.</Info>;
  }
  if (!d.takerOpen) {
    return <Info>Trading is closed — kick-off has passed.</Info>;
  }

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
        One action, locked once placed.
      </p>

      {pending ? (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg bg-secondary p-3 text-center text-sm">
            Confirm{" "}
            <span className={pending === "BUY" ? "text-up" : "text-down"}>
              {pending}
            </span>{" "}
            @ <span className="tnum">{price?.toFixed(1)}</span> · £{d.stake}/goal
          </div>
          <div className="flex gap-2">
            <Button className="h-11 flex-1 font-semibold" disabled={busy} onClick={confirm}>
              {busy ? "Placing…" : "Confirm"}
            </Button>
            <Button
              variant="outline"
              className="h-11 border-border"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setPending("BUY")}
            className="rounded-xl bg-up/15 py-3 text-center transition-colors hover:bg-up/25"
          >
            <div className="text-sm font-semibold text-up">BUY</div>
            <div className="tnum text-xs text-muted-foreground">@ {d.offer?.toFixed(1)}</div>
          </button>
          <button
            onClick={() => setPending("SELL")}
            className="rounded-xl bg-down/15 py-3 text-center transition-colors hover:bg-down/25"
          >
            <div className="text-sm font-semibold text-down">SELL</div>
            <div className="tnum text-xs text-muted-foreground">@ {d.bid.toFixed(1)}</div>
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </div>
  );
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
  return (
    <div className="panel rounded-2xl p-4 text-sm text-muted-foreground">{children}</div>
  );
}
