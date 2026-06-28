/**
 * Single source of truth for the Supremacy Desk game configuration.
 * See supremacy-build-spec.md §1, §5, §12 and the locked decisions in
 * claude-code-prompts.md. Import from here everywhere — never re-declare.
 */

/** The 8-player seed roster (open roster: more can be added later). */
export const PLAYERS = [
  "Pascal",
  "Elio",
  "Aida",
  "Matt",
  "Yas",
  "CP",
  "Chris",
  "Manas",
] as const;

export type PlayerName = (typeof PLAYERS)[number];

/** Fixed two-way market width: offer = bid + WIDTH. */
export const WIDTH = 0.2;

/** Knockout stages, in order. */
export const STAGES = ["R32", "R16", "QF", "SF", "3PO", "F"] as const;
export type Stage = (typeof STAGES)[number];

/** Stake in £/goal per stage (QF ratified at £30). */
export const STAKES: Record<Stage, number> = {
  R32: 10,
  R16: 20,
  QF: 30,
  SF: 50,
  "3PO": 50,
  F: 100,
};

/** Short display labels for each stage. */
export const STAGE_LABEL: Record<Stage, string> = {
  R32: "R32",
  R16: "R16",
  QF: "QF",
  SF: "SF",
  "3PO": "3rd PO",
  F: "Final",
};

/**
 * Admin holder (ratified: Yassine). The signed-in user whose email matches this
 * is flagged User.isAdmin. Override per-environment with NEXT_PUBLIC_ADMIN_EMAIL.
 */
export const ADMIN_EMAIL =
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "yassine.el.majdoubi@hotmail.com";

/**
 * Settlement basis: supremacy settles on the score AFTER EXTRA TIME (120'),
 * excluding the penalty shootout (a shootout = a draw, S = 0). See spec §3.
 */
export const SETTLEMENT_BASIS = "120min_exclPens" as const;

/** Per-player line/badge colour palette (from the original prototype). */
export const COLORS: Record<string, string> = {
  Pascal: "#ef4444",
  Elio: "#f59e0b",
  Aida: "#ec4899",
  Matt: "#a78bfa",
  Yas: "#38bdf8",
  CP: "#34d399",
  Chris: "#2dd4bf",
  Manas: "#facc15",
};

/** Fallback palette for players added beyond the seed roster. */
export const EXTRA_COLORS = [
  "#fb7185",
  "#60a5fa",
  "#4ade80",
  "#c084fc",
  "#fbbf24",
  "#22d3ee",
];

/** Stable colour for any player name (seed palette first, then hashed extras). */
export function colorFor(name: string): string {
  if (COLORS[name]) return COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return EXTRA_COLORS[Math.abs(hash) % EXTRA_COLORS.length];
}
