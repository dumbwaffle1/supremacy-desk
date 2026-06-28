// Pure deadline/window logic for the trading engine (spec §7). Kept free of
// Convex/db so it can be unit-tested directly.

/** Maker rate is due no later than 60 minutes before kick-off. */
export const MAKER_LEAD_MS = 60 * 60 * 1000;

/** Default maker quote applied when a maker misses the window (bid 0.0 / offer 0.2). */
export const DEFAULT_BID = 0;

/** Maker may submit while now is earlier than (KO − 60min). Unknown KO ⇒ open. */
export function makerWindowOpen(now: number, koUtc: number | null | undefined): boolean {
  if (koUtc === null || koUtc === undefined) return true;
  return now < koUtc - MAKER_LEAD_MS;
}

/** Takers may trade while now is earlier than KO. Unknown KO ⇒ open. */
export function takerWindowOpen(now: number, koUtc: number | null | undefined): boolean {
  if (koUtc === null || koUtc === undefined) return true;
  return now < koUtc;
}

/** A missing maker rate should be defaulted once now ≥ (KO − 60min). */
export function makerDefaultDue(now: number, koUtc: number | null | undefined): boolean {
  if (koUtc === null || koUtc === undefined) return false;
  return now >= koUtc - MAKER_LEAD_MS;
}

/** Non-trading takers are forced long once now ≥ KO. */
export function forcedLongDue(now: number, koUtc: number | null | undefined): boolean {
  if (koUtc === null || koUtc === undefined) return false;
  return now >= koUtc;
}
