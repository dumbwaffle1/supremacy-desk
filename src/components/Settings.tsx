"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bell, BellOff, ShieldCheck } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  currentEndpoint,
  isPushSupported,
  subscribeToPush,
  unsubscribeLocal,
} from "@/lib/push";
import { InvitePanel } from "@/components/admin/InvitePanel";
import { FixturesAdminPanel } from "@/components/FixturesAdminPanel";
import { MakerDrawPanel } from "@/components/admin/MakerDrawPanel";
import { RosterAdminPanel } from "@/components/admin/RosterAdminPanel";
import { StakesAdminPanel } from "@/components/admin/StakesAdminPanel";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";

function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-secondary"
      }`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function PrefRow({
  title,
  desc,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Settings({ leagueId }: { leagueId: string }) {
  const lid = leagueId as Id<"leagues">;
  const league = useQuery(api.leagues.get, { leagueId: lid });
  const prefs = useQuery(api.push.prefs);
  const setPrefs = useMutation(api.push.setPrefs);
  const subscribe = useMutation(api.push.subscribe);
  const unsubscribe = useMutation(api.push.unsubscribe);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    currentEndpoint().then((e) => setEnabled(!!e));
  }, []);

  const update = (patch: Partial<NonNullable<typeof prefs>>) => {
    if (!prefs) return;
    setPrefs({ maker: prefs.maker, taker: prefs.taker, settlement: prefs.settlement, ...patch });
  };

  const enable = async () => {
    setBusy(true);
    setErr(null);
    try {
      const sub = await subscribeToPush();
      await subscribe(sub);
      setEnabled(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't enable notifications.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeLocal();
      if (endpoint) await unsubscribe({ endpoint });
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  };

  const supported = isPushSupported();
  const isAdmin = !!league?.me.isAdmin;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {/* Notifications */}
      <div className="panel rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Notifications</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {enabled
                ? "On for this device."
                : "Get reminders + results on this device."}
            </p>
          </div>
          {!supported ? (
            <span className="text-xs text-muted-foreground">Unsupported</span>
          ) : enabled ? (
            <Button size="sm" variant="outline" className="border-border" disabled={busy} onClick={disable}>
              <BellOff className="size-4" /> Off
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={enable}>
              <Bell className="size-4" /> {busy ? "…" : "Enable"}
            </Button>
          )}
        </div>
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

        <div className="mt-2 divide-y divide-border">
          <PrefRow
            title="Maker reminders"
            desc="When you're the maker, before your rate is due."
            checked={prefs?.maker ?? true}
            onChange={(v) => update({ maker: v })}
            disabled={!prefs}
          />
          <PrefRow
            title="Trade reminders"
            desc="When a game is about to kick off and you haven't traded."
            checked={prefs?.taker ?? true}
            onChange={(v) => update({ taker: v })}
            disabled={!prefs}
          />
          <PrefRow
            title="Result summaries"
            desc="Your outcome when a game settles."
            checked={prefs?.settlement ?? true}
            onChange={(v) => update({ settlement: v })}
            disabled={!prefs}
          />
        </div>
        {supported && !enabled && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Enable notifications above to actually receive these.
          </p>
        )}
      </div>

      {/* Invite — visible to every member */}
      <InvitePanel leagueId={leagueId} />

      {/* Admin */}
      {isAdmin && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-1.5 pt-1 text-sm font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="size-4" /> Admin
          </h2>
          <FixturesAdminPanel leagueId={leagueId} />
          <MakerDrawPanel leagueId={leagueId} />
          <RosterAdminPanel leagueId={leagueId} />
          <StakesAdminPanel leagueId={leagueId} />
          <AuditLogPanel leagueId={leagueId} />
        </div>
      )}
    </div>
  );
}
