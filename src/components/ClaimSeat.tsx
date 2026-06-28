"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { colorFor } from "@/config/constants";

export function ClaimSeat({
  leagueId,
  leagueName,
}: {
  leagueId: string;
  leagueName: string;
}) {
  const lid = leagueId as Id<"leagues">;
  const players = useQuery(api.players.list, { leagueId: lid });
  const claimPlayer = useMutation(api.users.claimPlayer);
  const addAndClaim = useMutation(api.users.addAndClaimPlayer);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unclaimed = (players ?? []).filter((p) => !p.claimed);

  const doClaim = async (playerId: Id<"players">) => {
    setBusy(true);
    setError(null);
    try {
      await claimPlayer({ leagueId: lid, playerId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim that name.");
    } finally {
      setBusy(false);
    }
  };

  const doAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addAndClaim({ leagueId: lid, name: newName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that name.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-6"
      >
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
            {leagueName}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Claim your seat
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {adding ? "Add your name." : "Tap your name — or add it if you're not listed."}
          </p>
        </div>

        <div className="panel rounded-2xl p-5">
          {players === undefined ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : adding ? (
            <form onSubmit={doAdd} className="space-y-3">
              <Input
                placeholder="Your name"
                className="h-11"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={24}
                autoFocus
                required
              />
              <div className="flex gap-2">
                <Button type="submit" className="h-11 flex-1 font-semibold" disabled={busy}>
                  {busy ? "Adding…" : "Add & claim"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-border"
                  onClick={() => setAdding(false)}
                  disabled={busy}
                >
                  <ArrowLeft className="size-4" />
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {unclaimed.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  Every name is taken — add yourself below.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2">
                  {unclaimed.map((p, i) => (
                    <motion.li
                      key={p._id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.03 * i, duration: 0.35 }}
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => doClaim(p._id as Id<"players">)}
                        className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-left text-sm font-medium transition-all hover:border-primary/40 hover:bg-accent disabled:opacity-50"
                      >
                        <span
                          className="inline-block size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: colorFor(p.name) }}
                        />
                        {p.name}
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )}
              <Button
                variant="outline"
                className="h-11 w-full border-dashed border-border bg-transparent text-muted-foreground hover:text-foreground"
                onClick={() => setAdding(true)}
                disabled={busy}
              >
                <Plus className="size-4" /> I&apos;m not on the list
              </Button>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        <Link href="/" className="mx-auto block text-center text-xs text-muted-foreground underline underline-offset-4">
          Back to your Supremacies
        </Link>
      </motion.div>
    </div>
  );
}
