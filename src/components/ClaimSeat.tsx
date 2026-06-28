"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-8">
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Claim your seat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick your name — or add it if you&apos;re not listed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {adding ? "Add your name" : "Who are you?"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {players === undefined ? (
            <p className="text-sm text-muted-foreground">Loading roster…</p>
          ) : adding ? (
            <form onSubmit={doAdd} className="space-y-3">
              <Input
                placeholder="Your name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={24}
                autoFocus
                required
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={busy}>
                  {busy ? "Adding…" : "Add & claim"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAdding(false);
                    setError(null);
                  }}
                  disabled={busy}
                >
                  Back
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {unclaimed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Every seeded name is taken — add yourself below.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2">
                  {unclaimed.map((p) => (
                    <li key={p._id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => doClaim(p._id)}
                        className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                      >
                        <span
                          className="inline-block size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: colorFor(p.name) }}
                        />
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setAdding(true);
                  setError(null);
                }}
                disabled={busy}
              >
                I&apos;m not on the list
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <button
        type="button"
        className="mx-auto mt-6 text-xs text-muted-foreground underline"
        onClick={() => signOut()}
      >
        Sign out
      </button>
    </div>
  );
}
