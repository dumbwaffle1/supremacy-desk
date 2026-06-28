"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { colorFor } from "@/config/constants";

export function RosterAdminPanel({ leagueId }: { leagueId: string }) {
  const lid = leagueId as Id<"leagues">;
  const players = useQuery(api.players.list, { leagueId: lid });
  const addPlayer = useMutation(api.admin.addPlayer);
  const removePlayer = useMutation(api.admin.removePlayer);
  const renamePlayer = useMutation(api.users.adminRenamePlayer);
  const clearClaim = useMutation(api.users.adminClearClaim);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const wrap = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    }
  };

  if (players === undefined) {
    return <div className="panel h-32 animate-pulse rounded-2xl" />;
  }

  return (
    <div className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold">Roster</h2>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          wrap(async () => {
            await addPlayer({ leagueId: lid, name: newName });
            setNewName("");
          });
        }}
      >
        <Input
          placeholder="Add a name"
          className="h-9"
          value={newName}
          maxLength={24}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button size="sm" type="submit" className="h-9" disabled={!newName.trim()}>
          <Plus className="size-4" />
        </Button>
      </form>

      <ul className="mt-3 divide-y divide-border">
        {players.map((p) => (
          <li key={p._id} className="flex items-center justify-between gap-2 py-2">
            {editingId === p._id ? (
              <>
                <Input
                  className="h-8"
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      wrap(async () => {
                        await renamePlayer({
                          playerId: p._id as Id<"players">,
                          name: editName,
                        });
                        setEditingId(null);
                      })
                    }
                    className="grid size-7 place-items-center rounded-md text-up hover:bg-accent"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: colorFor(p.name) }} />
                  {p.name}
                  {p.claimed && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      claimed
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <button
                    onClick={() => {
                      setEditingId(p._id);
                      setEditName(p.name);
                    }}
                    className="grid size-7 place-items-center rounded-md hover:bg-accent hover:text-foreground"
                    aria-label="Rename"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  {p.claimed ? (
                    <button
                      onClick={() => wrap(() => clearClaim({ playerId: p._id as Id<"players"> }))}
                      className="rounded-md px-2 py-1 text-xs hover:bg-accent hover:text-foreground"
                    >
                      unclaim
                    </button>
                  ) : (
                    <button
                      onClick={() => wrap(() => removePlayer({ playerId: p._id as Id<"players"> }))}
                      className="grid size-7 place-items-center rounded-md hover:bg-accent hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
