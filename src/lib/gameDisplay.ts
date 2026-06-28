// Display helpers shared by the Games list + detail.

export type DisplayStatus = "Open" | "Live" | "Closed" | "Settled" | "Void";

export function displayStatus(
  status: string,
  koUtc: number | null,
  now: number,
): DisplayStatus {
  if (status === "SETTLED") return "Settled";
  if (status === "VOID") return "Void";
  if (status === "LIVE") return "Live";
  if (status === "FT") return "Closed";
  // SCHEDULED
  if (koUtc !== null && now >= koUtc) return "Closed";
  return "Open";
}

export const STATUS_STYLE: Record<DisplayStatus, string> = {
  Open: "bg-primary/15 text-primary",
  Live: "bg-up/15 text-up",
  Closed: "bg-secondary text-muted-foreground",
  Settled: "bg-secondary text-foreground",
  Void: "bg-destructive/15 text-destructive",
};

/** "+2", "−1", "0" supremacy from a settled/live home−away score. */
export function supremacy(home: number, away: number): string {
  const s = home - away;
  return s > 0 ? `+${s}` : s < 0 ? `−${Math.abs(s)}` : "0";
}

export function koLabel(koUtc: number | null): string {
  if (koUtc === null) return "TBD";
  return new Date(koUtc).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
