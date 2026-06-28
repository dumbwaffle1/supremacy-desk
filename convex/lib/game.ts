// Server-side game math. Pulls WIDTH/STAKES from the single source of truth in
// src/config/constants.ts so the rules never drift between client and server.
import { STAKES, WIDTH, type Stage } from "../../src/config/constants";

/** Round to 2 decimal places (prices/P&L). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** offer = bid + WIDTH. Always derive — never store offer separately. */
export function offerFor(bid: number): number {
  return round2(bid + WIDTH);
}

/** Stake in £/goal for a stage. */
export function stakeForStage(stage: Stage): number {
  return STAKES[stage];
}

export type QuoteTeam = "HOME" | "AWAY";

/** Supremacy of the quoted team = its goals − the opponent's (post-ET, no pens). */
export function teamSupremacy(
  quoteTeam: QuoteTeam,
  settleHome: number,
  settleAway: number,
): number {
  return quoteTeam === "AWAY" ? settleAway - settleHome : settleHome - settleAway;
}

/**
 * Taker P&L on the quoted team (spec §5, generalised):
 *   BUY  (long the team)  → (teamSupremacy − offer) × stake   [priceTaken = offer]
 *   SELL (lay the team)   → (bid − teamSupremacy) × stake      [priceTaken = bid]
 */
export function tradePnl(
  side: "BUY" | "SELL",
  priceTaken: number,
  teamSup: number,
  stake: number,
): number {
  const raw = side === "BUY" ? teamSup - priceTaken : priceTaken - teamSup;
  return round2(raw * stake);
}
