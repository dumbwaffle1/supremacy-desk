"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Check, Lock } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { colorFor, STAGE_LABEL, type Stage } from "@/config/constants";

function gbp(n: number, signed = false): string {
  const sign = n < 0 ? "−" : signed ? "+" : "";
  return `${sign}£${Math.abs(n)}`;
}

function Dot({ name }: { name: string }) {
  return (
    <span className="size-2.5 rounded-full" style={{ backgroundColor: colorFor(name) }} />
  );
}

export function Settle() {
  const data = useQuery(api.ledger.ledger);
  const me = useQuery(api.users.me);
  const recordPayment = useMutation(api.ledger.recordPayment);
  const clearPayment = useMutation(api.ledger.clearPayment);
  const finalSettle = useMutation(api.ledger.finalSettle);
  const [busy, setBusy] = useState(false);

  const isAdmin = !!me?.isAdmin;

  if (data === undefined) {
    return <div className="panel h-40 animate-pulse rounded-2xl" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settle</h1>
        <p className="text-sm text-muted-foreground">
          Who pays whom · cash settles offline
        </p>
      </div>

      {data.settledCount === 0 ? (
        <div className="panel rounded-2xl p-6 text-center text-sm text-muted-foreground">
          Nothing to settle yet — balances appear as games settle.
        </div>
      ) : (
        <>
          {!data.zeroSum && (
            <div className="panel rounded-2xl p-3 text-xs text-down">
              Heads up: balances don&apos;t sum to £0 — check for a void/re-settle.
            </div>
          )}

          {/* Net balances */}
          <div className="panel overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-semibold">Net balances</h2>
              <span className="text-[11px] text-muted-foreground">
                {data.settledCount} settled
              </span>
            </div>
            <ul className="divide-y divide-border">
              {data.balances.map((b) => (
                <li key={b.player} className="flex items-center justify-between px-4 py-2.5">
                  <span className="flex items-center gap-2.5 text-sm font-medium">
                    <Dot name={b.player} /> {b.player}
                  </span>
                  <span
                    className={`tnum text-sm font-semibold ${
                      b.net > 0 ? "text-up" : b.net < 0 ? "text-down" : "text-muted-foreground"
                    }`}
                  >
                    {gbp(b.net, true)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Transfers */}
          <div className="panel overflow-hidden rounded-2xl">
            <div className="px-4 py-3">
              <h2 className="text-sm font-semibold">
                Transfers
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  fewest to clear
                </span>
              </h2>
            </div>
            {data.transfers.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">All square.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.transfers.map((t) => (
                  <li
                    key={`${t.from}->${t.to}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div
                      className={`flex items-center gap-2 text-sm ${
                        t.paid ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        <Dot name={t.from} /> {t.from}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <span className="flex items-center gap-1.5 font-medium">
                        <Dot name={t.to} /> {t.to}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tnum text-sm font-semibold">{gbp(t.amount)}</span>
                      {isAdmin && (
                        <button
                          onClick={() =>
                            t.paid
                              ? clearPayment({ from: t.from, to: t.to })
                              : recordPayment({ from: t.from, to: t.to, amount: t.amount })
                          }
                          className={`grid size-6 place-items-center rounded-full border transition-colors ${
                            t.paid
                              ? "border-up bg-up/15 text-up"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                          aria-label={t.paid ? "Mark unpaid" : "Mark paid"}
                        >
                          <Check className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Per-stage breakdown */}
          {data.stageBreakdown.length > 0 && (
            <div className="panel overflow-hidden rounded-2xl">
              <h2 className="px-4 pt-4 text-sm font-semibold">By stage</h2>
              <div className="mt-2 divide-y divide-border">
                {data.stageBreakdown.map((s) => (
                  <div key={s.stage} className="px-4 py-3">
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {STAGE_LABEL[s.stage as Stage]}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {s.rows.map((r) => (
                        <span key={r.player} className="flex items-center gap-1.5 text-xs">
                          <Dot name={r.player} /> {r.player}
                          <span
                            className={`tnum font-medium ${
                              r.net > 0 ? "text-up" : "text-down"
                            }`}
                          >
                            {gbp(r.net, true)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Official result / final settle */}
          {data.snapshot ? (
            <div className="panel rounded-2xl p-4 ring-1 ring-primary/20">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                <Lock className="size-4" /> Official result
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Snapshotted by {data.snapshot.by}.
              </p>
              <ul className="mt-2 space-y-1">
                {data.snapshot.transfers.map((t) => (
                  <li key={`${t.from}->${t.to}`} className="flex items-center gap-2 text-sm">
                    <Dot name={t.from} /> {t.from}
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <Dot name={t.to} /> {t.to}
                    <span className="tnum ml-auto font-semibold">{gbp(t.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            isAdmin && (
              <Button
                variant="outline"
                className="w-full border-border"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await finalSettle({});
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Snapshotting…" : "Final settle (snapshot official result)"}
              </Button>
            )
          )}
        </>
      )}
    </div>
  );
}
