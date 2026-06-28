import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { stageValidator } from "./schema";
import type { Stage } from "../src/config/constants";

// football-data.org v4 — free tier includes the FIFA World Cup ("WC").
// Auth header: X-Auth-Token. Set with: npx convex env set FOOTBALL_DATA_KEY <key>
const API_BASE = "https://api.football-data.org/v4";
const COMPETITION = "WC"; // FIFA World Cup

/** Map football-data.org `stage` enum to our stage; null = group stage / skip. */
export function fdStageToStage(stage: string): Stage | null {
  const s = (stage ?? "").toUpperCase();
  if (s.includes("LAST_32") || s.includes("32")) return "R32";
  if (s.includes("LAST_16") || s.includes("16")) return "R16";
  if (s.includes("QUARTER")) return "QF";
  if (s.includes("SEMI")) return "SF";
  if (s.includes("THIRD")) return "3PO";
  if (s === "FINAL") return "F";
  return null;
}

/** football-data.org status -> our stored Game.status. */
export function mapStatus(status: string): "SCHEDULED" | "LIVE" | "FT" {
  if (["IN_PLAY", "PAUSED"].includes(status)) return "LIVE";
  if (["FINISHED", "AWARDED"].includes(status)) return "FT";
  return "SCHEDULED"; // SCHEDULED, TIMED, POSTPONED, SUSPENDED, CANCELLED
}

type FdScore = {
  duration?: string; // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
  fullTime?: { home: number | null; away: number | null };
  regularTime?: { home: number | null; away: number | null } | null;
  extraTime?: { home: number | null; away: number | null } | null;
};

/**
 * Settlement score = score after extra time, EXCLUDING penalties (spec §3).
 * football-data's `fullTime` INCLUDES the shootout (e.g. 7-6), so for a
 * PENALTY_SHOOTOUT we use regularTime + extraTime (the 120' draw). Returns null
 * if the score isn't available yet. Exported for the settlement cron (Prompt 7).
 */
export function settlementScore(
  score: FdScore | undefined,
): { home: number; away: number } | null {
  if (!score) return null;
  if (score.duration === "PENALTY_SHOOTOUT") {
    const reg = score.regularTime;
    const et = score.extraTime;
    return {
      home: (reg?.home ?? 0) + (et?.home ?? 0),
      away: (reg?.away ?? 0) + (et?.away ?? 0),
    };
  }
  // REGULAR or EXTRA_TIME: fullTime is already the post-ET score (no pens).
  const ft = score.fullTime;
  if (ft?.home == null || ft?.away == null) return null;
  return { home: ft.home, away: ft.away };
}

const fixtureValidator = v.object({
  fixtureId: v.number(),
  round: v.string(),
  stage: stageValidator,
  home: v.optional(v.string()),
  away: v.optional(v.string()),
  koUtc: v.optional(v.number()),
  statusShort: v.string(),
});

/**
 * Update every league's games for each fixture (matched by fixtureId): teams,
 * kick-off, round, status. League games are created at league-creation, so this
 * never inserts. Never downgrades a SETTLED/VOID game.
 */
export const upsertFromApi = internalMutation({
  args: { fixtures: v.array(fixtureValidator) },
  handler: async (ctx, { fixtures }) => {
    let updated = 0;
    for (const f of fixtures) {
      const games = await ctx.db
        .query("games")
        .withIndex("by_fixtureId", (q) => q.eq("fixtureId", f.fixtureId))
        .collect();
      const status = mapStatus(f.statusShort);
      for (const g of games) {
        const base = {
          stage: f.stage,
          round: f.round,
          home: f.home,
          away: f.away,
          koUtc: f.koUtc,
        };
        await ctx.db.patch(
          g._id,
          g.status === "SETTLED" || g.status === "VOID" ? base : { ...base, status },
        );
        updated++;
      }
    }
    return { updated, fixtures: fixtures.length };
  },
});

/** Fetch the WC knockout fixtures and upsert. Run by cron + admin button. */
export const sync = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const key = process.env.FOOTBALL_DATA_KEY;
    if (!key) {
      console.error(
        "[fixtures] FOOTBALL_DATA_KEY not set. Run: npx convex env set FOOTBALL_DATA_KEY <key>",
      );
      return { ok: false, error: "FOOTBALL_DATA_KEY not set" };
    }

    const res = await fetch(`${API_BASE}/competitions/${COMPETITION}/matches`, {
      headers: { "X-Auth-Token": key },
    });

    console.log(
      `[fixtures] quota — ${res.headers.get(
        "X-Requests-Available-Minute",
      )} req/min remaining (resets in ${res.headers.get("X-RequestCounter-Reset")}s)`,
    );

    if (!res.ok) {
      console.error(`[fixtures] HTTP ${res.status}: ${await res.text()}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as {
      matches?: Array<{
        id: number;
        utcDate: string;
        status: string;
        stage: string;
        homeTeam?: { name?: string | null; shortName?: string | null };
        awayTeam?: { name?: string | null; shortName?: string | null };
      }>;
    };

    const matches = json.matches ?? [];
    const skippedStages = new Set<string>();
    const fixtures = [];
    for (const m of matches) {
      const stage = fdStageToStage(m.stage);
      if (!stage) {
        skippedStages.add(m.stage);
        continue;
      }
      fixtures.push({
        fixtureId: m.id,
        round: m.stage,
        stage,
        home: m.homeTeam?.name ?? m.homeTeam?.shortName ?? undefined,
        away: m.awayTeam?.name ?? m.awayTeam?.shortName ?? undefined,
        koUtc: m.utcDate ? Date.parse(m.utcDate) : undefined,
        statusShort: m.status,
      });
    }

    const result = await ctx.runMutation(internal.fixtures.upsertFromApi, {
      fixtures,
    });
    console.log(
      `[fixtures] ${fixtures.length} knockout fixtures · updated ${result.updated} league games. ` +
        `Skipped stages: ${[...skippedStages].join(", ") || "none"}`,
    );
    return { ok: true, ...result };
  },
});

/** Admin-triggered sync (from the Admin screen). */
export const syncNow = action({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me?.isAdmin) throw new Error("Admins only.");
    return await ctx.runAction(internal.fixtures.sync, {});
  },
});
