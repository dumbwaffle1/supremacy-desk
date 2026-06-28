"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WIDTH, colorFor } from "@/config/constants";

export function AdminOverridePanel() {
  const games = useQuery(api.games.list);
  const players = useQuery(api.players.list);
  const [gameId, setGameId] = useState<Id<"games"> | "">("");
  const detail = useQuery(api.games.detail, gameId ? { gameId } : "skip");

  const overrideBid = useMutation(api.admin.overrideMakerBid);
  const overrideTrade = useMutation(api.admin.overrideTrade);
  const removeTrade = useMutation(api.admin.removeTrade);

  const [bidInput, setBidInput] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const sideOf = (player: string) =>
    detail?.book.find((b) => b.player === player)?.side ?? null;

  const wrap = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    }
  };

  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold">Override inputs</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Enter rates &amp; trades on a player&apos;s behalf — bypasses deadlines.
        Every change is audited.
      </p>

      {/* Game picker */}
      <select
        value={gameId}
        onChange={(e) => {
          setGameId(e.target.value as Id<"games"> | "");
          setBidInput("");
          setErr(null);
        }}
        className="mt-4 h-10 w-full rounded-lg border border-input bg-secondary px-3 text-sm"
      >
        <option value="">Select a game…</option>
        {(games ?? []).map((g) => (
          <option key={g._id} value={g._id}>
            #{g.gameNo} {g.stage} · {g.home ?? "TBD"} v {g.away ?? "TBD"}
          </option>
        ))}
      </select>

      {detail && (
        <div className="mt-4 space-y-4">
          {/* Maker rate */}
          <div className="rounded-xl bg-secondary/50 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Maker:{" "}
                <span className="font-medium text-foreground">
                  {detail.makerPlayer ?? "—"}
                </span>
              </span>
              <span className="tnum">
                {detail.bid !== null
                  ? `bid ${detail.bid.toFixed(1)} / offer ${detail.offer?.toFixed(1)}`
                  : "no rate"}
                {detail.defaultedMaker ? " (defaulted)" : ""}
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                type="number"
                step="0.1"
                inputMode="decimal"
                placeholder={`bid (offer = bid + ${WIDTH})`}
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                className="h-9"
              />
              <Button
                size="sm"
                className="h-9"
                disabled={bidInput === ""}
                onClick={() =>
                  wrap(async () => {
                    await overrideBid({
                      gameId: detail._id,
                      bid: Number(bidInput),
                    });
                    setBidInput("");
                  })
                }
              >
                Set rate
              </Button>
            </div>
          </div>

          {/* Per-player trades */}
          <div className="space-y-1.5">
            {(players ?? [])
              .filter((p) => p.name !== detail.makerPlayer)
              .map((p) => {
                const side = sideOf(p.name);
                return (
                  <div
                    key={p._id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-1.5"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: colorFor(p.name) }}
                      />
                      {p.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {(["BUY", "SELL"] as const).map((s) => (
                        <button
                          key={s}
                          disabled={detail.bid === null}
                          onClick={() =>
                            wrap(() =>
                              overrideTrade({
                                gameId: detail._id,
                                player: p.name,
                                side: s,
                              }),
                            )
                          }
                          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
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
                        onClick={() =>
                          wrap(() =>
                            removeTrade({ gameId: detail._id, player: p.name }),
                          )
                        }
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                      >
                        clear
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
    </div>
  );
}
