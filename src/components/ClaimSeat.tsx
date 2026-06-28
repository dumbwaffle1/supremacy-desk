"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowLeft, Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { colorFor } from "@/config/constants";

export function ClaimSeat() {
  const players = useQuery(api.players.list);
  const claimPlayer = useMutation(api.users.claimPlayer);
  const addAndClaim = useMutation(api.users.addAndClaimPlayer);
  const { signOut } = useAuthActions();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unclaimed = (players ?? []).filter((p) => !p.claimed);

  const doClaim = async (playerId: (typeof unclaimed)[number]["_id"]) => {
    setBusy(true);
    setError(null);
    try {
      await claimPlayer({ playerId });
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
      await addAndClaim({ name: newName });
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
            Welcome
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Claim your seat
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {adding
              ? "Add your name to the roster."
              : "Tap your name — or add it if you're not listed."}
          </p>
        </div>

        <div className="panel rounded-2xl p-5">
          {players === undefined ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading roster…
            </p>
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
                <Button
                  type="submit"
                  className="h-11 flex-1 bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                  disabled={busy}
                >
                  {busy ? "Adding…" : "Add & claim"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-border bg-secondary/40"
                  onClick={() => {
                    setAdding(false);
                    setError(null);
                  }}
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
                  Every seeded name is taken — add yourself below.
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
                        onClick={() => doClaim(p._id)}
                        className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-left text-sm font-medium transition-all hover:border-brand/40 hover:bg-accent disabled:opacity-50"
                      >
                        <span
                          className="inline-block size-3 shrink-0 rounded-full ring-2 ring-transparent transition-all group-hover:ring-white/10"
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
                onClick={() => {
                  setAdding(true);
                  setError(null);
                }}
                disabled={busy}
              >
                <Plus className="size-4" />
                I&apos;m not on the list
              </Button>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        <button
          type="button"
          className="mx-auto block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </motion.div>
    </div>
  );
}
