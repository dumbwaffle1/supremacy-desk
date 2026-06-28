"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

function when(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summary(a: { action: string; after: unknown; before: unknown }): string {
  const o = (a.after ?? a.before ?? {}) as Record<string, unknown>;
  const bits = Object.entries(o)
    .filter(([k]) => k !== "supremacy")
    .slice(0, 3)
    .map(([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`);
  return bits.join(" · ");
}

export function AuditLogPanel() {
  const logs = useQuery(api.auditLogs.recent);
  if (logs === undefined) {
    return <div className="panel h-32 animate-pulse rounded-2xl" />;
  }

  return (
    <div className="panel overflow-hidden rounded-2xl">
      <h2 className="px-4 pt-4 text-sm font-semibold">Audit log</h2>
      {logs.length === 0 ? (
        <p className="px-4 pb-4 pt-2 text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="mt-2 max-h-80 divide-y divide-border overflow-y-auto">
          {logs.map((l) => (
            <li key={l._id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium">{l.action}</span>
                <span className="text-[10px] text-muted-foreground">{when(l.ts)}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                <span className="text-foreground/80">{l.actor}</span>
                {summary(l) && <> · {summary(l)}</>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
