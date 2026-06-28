"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight, LogOut, Plus, Trophy, Users, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/BrandMark";

export function Home() {
  const leagues = useQuery(api.leagues.mine);
  const me = useQuery(api.users.me);
  const others = useQuery(api.leagues.others);
  const { signOut } = useAuthActions();
  const [mode, setMode] = useState<"list" | "create" | "join">("list");
  const [tab, setTab] = useState<"mine" | "others">("mine");
  const isSuper = !!me?.isAdmin;

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
            {isSuper && tab === "others" ? "Other Supremacies" : "Your Supremacies"}
          </h1>

          {isSuper && (
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
              {(["mine", "others"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    tab === t ? "bg-background text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {t === "mine" ? "Mine" : "Others"}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-2.5">
            {tab === "others" && isSuper ? (
              others === undefined ? (
                <div className="panel h-20 animate-pulse rounded-2xl" />
              ) : others.length === 0 ? (
                <div className="panel rounded-2xl p-6 text-center text-sm text-muted-foreground">
                  No other Supremacies.
                </div>
              ) : (
                others.map((l) => (
                  <Link
                    key={l._id}
                    href={`/l/${l._id}`}
                    className="panel panel-hover flex items-center gap-3 rounded-2xl p-4"
                  >
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary">
                      <Trophy className="size-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{l.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="size-3" /> {l.playerCount}
                        </span>
                        <span>·</span>
                        <span>{l.settledCount} settled</span>
                        {l.ownerEmail && (
                          <>
                            <span>·</span>
                            <span className="truncate">{l.ownerEmail}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                      peek
                    </span>
                  </Link>
                ))
              )
            ) : leagues === undefined ? (
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
  const [players, setPlayers] = useState<string[]>([]);
  const [playerInput, setPlayerInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addPlayer = () => {
    const t = playerInput.trim();
    setPlayerInput("");
    if (!t) return;
    if (
      t.toLowerCase() === myName.trim().toLowerCase() ||
      players.some((p) => p.toLowerCase() === t.toLowerCase())
    )
      return;
    setPlayers((p) => [...p, t]);
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { leagueId } = await create({ name, myName, players });
      router.push(`/l/${leagueId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <button type="button" onClick={onDone} className="text-sm text-muted-foreground">
        ← Back
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">New Supremacy</h1>
      <div className="panel space-y-4 rounded-2xl p-5">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Tournament
          </label>
          <select
            className="mt-1 h-11 w-full rounded-lg border border-input bg-secondary px-3 text-sm"
            value="WC2026"
            onChange={() => {}}
          >
            <option value="WC2026">World Cup 2026 · Knockouts</option>
          </select>
        </div>

        <Input placeholder="League name (e.g. The Lads)" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Your name" className="h-11" value={myName} onChange={(e) => setMyName(e.target.value)} required />

        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Other players
          </label>
          <div className="mt-1 flex gap-2">
            <Input
              placeholder="Add a name"
              className="h-10"
              value={playerInput}
              maxLength={24}
              onChange={(e) => setPlayerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPlayer();
                }
              }}
            />
            <Button type="button" size="sm" className="h-10" onClick={addPlayer}>
              <Plus className="size-4" />
            </Button>
          </div>
          {players.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {players.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs"
                >
                  {p}
                  <button
                    type="button"
                    onClick={() => setPlayers((x) => x.filter((n) => n !== p))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Friends can also join later with the invite link.
          </p>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Matches already kicked off are skipped (void). Stakes default to
          £10/20/30/50/50/100 per stage — editable in Settings → Admin.
        </p>
        <Button className="h-11 w-full font-semibold" disabled={busy || !myName.trim()} onClick={submit}>
          {busy ? "Creating…" : "Create Supremacy"}
        </Button>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    </div>
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
