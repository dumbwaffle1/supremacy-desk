"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight, LogOut, Plus, Trophy, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/BrandMark";

export function Home() {
  const leagues = useQuery(api.leagues.mine);
  const { signOut } = useAuthActions();
  const [mode, setMode] = useState<"list" | "create" | "join">("list");

  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pb-16 pt-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-base font-semibold tracking-tight">Supremacy</span>
        </div>
        <button
          onClick={() => signOut()}
          aria-label="Sign out"
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </header>

      {mode === "create" ? (
        <CreateLeague onDone={() => setMode("list")} />
      ) : mode === "join" ? (
        <JoinLeague onDone={() => setMode("list")} />
      ) : (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Your Supremacies
          </h1>

          <div className="mt-4 space-y-2.5">
            {leagues === undefined ? (
              <div className="panel h-20 animate-pulse rounded-2xl" />
            ) : leagues.length === 0 ? (
              <div className="panel rounded-2xl p-6 text-center text-sm text-muted-foreground">
                No Supremacies yet — create one or join with a code.
              </div>
            ) : (
              leagues.map((l) => (
                <Link
                  key={l._id}
                  href={`/l/${l._id}`}
                  className="panel panel-hover flex items-center gap-3 rounded-2xl p-4"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary">
                    <Trophy className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{l.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="size-3" /> {l.playerCount}
                      </span>
                      <span>·</span>
                      <span>{l.settledCount} settled</span>
                      {l.myPlayer && (
                        <>
                          <span>·</span>
                          <span className="text-foreground">{l.myPlayer}</span>
                        </>
                      )}
                      {l.isOwner && (
                        <span className="rounded bg-secondary px-1.5 text-[10px] text-primary">
                          owner
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              ))
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <Button className="h-11 flex-1 font-semibold" onClick={() => setMode("create")}>
              <Plus className="size-4" /> New
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 border-border"
              onClick={() => setMode("join")}
            >
              Join with code
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function CreateLeague({ onDone }: { onDone: () => void }) {
  const create = useMutation(api.leagues.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [myName, setMyName] = useState("");
  const [others, setOthers] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const players = others
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const { leagueId } = await create({ name, myName, players });
      router.push(`/l/${leagueId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <button type="button" onClick={onDone} className="text-sm text-muted-foreground">
        ← Back
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">New Supremacy</h1>
      <div className="panel space-y-3 rounded-2xl p-5">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Tournament
          </label>
          <div className="mt-1 rounded-lg bg-secondary px-3 py-2 text-sm">
            World Cup 2026 · Knockouts
          </div>
        </div>
        <Input placeholder="Name (e.g. The Lads)" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Your name" className="h-11" value={myName} onChange={(e) => setMyName(e.target.value)} required />
        <textarea
          placeholder="Other players, one per line (optional)"
          rows={4}
          value={others}
          onChange={(e) => setOthers(e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Stakes default to £10/20/30/50/50/100 per stage — editable in Admin later.
        </p>
        <Button type="submit" className="h-11 w-full font-semibold" disabled={busy || !myName.trim()}>
          {busy ? "Creating…" : "Create Supremacy"}
        </Button>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    </form>
  );
}

function JoinLeague({ onDone }: { onDone: () => void }) {
  const join = useMutation(api.leagues.join);
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { leagueId } = await join({ inviteCode: code });
      router.push(`/l/${leagueId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <button type="button" onClick={onDone} className="text-sm text-muted-foreground">
        ← Back
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">Join a Supremacy</h1>
      <div className="panel space-y-3 rounded-2xl p-5">
        <Input
          placeholder="Invite code"
          className="h-11 uppercase tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <Button type="submit" className="h-11 w-full font-semibold" disabled={busy || !code.trim()}>
          {busy ? "Joining…" : "Join"}
        </Button>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    </form>
  );
}
