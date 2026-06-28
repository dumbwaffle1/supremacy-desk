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

const STAGE_ORDER: Record<Stage, number> = {
  R32: 0,
  R16: 1,
  QF: 2,
  SF: 3,
  "3PO": 4,
  F: 5,
};

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
 * Idempotent upsert. Matches existing games by fixtureId; otherwise adopts a
 * seeded placeholder (same gameNo, has a maker, no fixtureId yet) so maker
 * assignments + any bids/trades survive; otherwise inserts. Never wipes
 * makerPlayer/bid, never downgrades a SETTLED/VOID game.
 */
export const upsertFromApi = internalMutation({
  args: { fixtures: v.array(fixtureValidator) },
  handler: async (ctx, { fixtures }) => {
    const sorted = [...fixtures].sort(
      (a, b) =>
        STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] ||
        (a.koUtc ?? Infinity) - (b.koUtc ?? Infinity) ||
        a.fixtureId - b.fixtureId,
    );

    const existing = await ctx.db.query("games").collect();
    const byFixture = new Map(
      existing
        .filter((g) => g.fixtureId !== undefined)
        .map((g) => [g.fixtureId as number, g]),
    );
    const placeholders = existing.filter((g) => g.fixtureId === undefined);

    let created = 0;
    let updated = 0;
    let adopted = 0;

    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      const gameNo = i + 1;
      const status = mapStatus(f.statusShort);

      const ex = byFixture.get(f.fixtureId);
      if (ex) {
        const base = {
          gameNo,
          stage: f.stage,
          round: f.round,
          home: f.home,
          away: f.away,
          koUtc: f.koUtc,
        };
        await ctx.db.patch(
          ex._id,
          ex.status === "SETTLED" || ex.status === "VOID"
            ? base
            : { ...base, status },
        );
        updated++;
        continue;
      }

      const ph = placeholders.find(
        (g) =>
          g.gameNo === gameNo &&
          g.makerPlayer !== undefined &&
          g.fixtureId === undefined,
      );
      if (ph) {
        await ctx.db.patch(ph._id, {
          fixtureId: f.fixtureId,
          stage: f.stage,
          round: f.round,
          home: f.home,
          away: f.away,
          koUtc: f.koUtc,
          status,
        });
        ph.fixtureId = f.fixtureId;
        adopted++;
        continue;
      }

      await ctx.db.insert("games", {
        fixtureId: f.fixtureId,
        gameNo,
        stage: f.stage,
        round: f.round,
        home: f.home,
        away: f.away,
        koUtc: f.koUtc,
        status,
      });
      created++;
    }

    return { created, updated, adopted, total: sorted.length };
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
      `[fixtures] synced ${fixtures.length} knockout fixtures of ${matches.length} returned ` +
        `(created ${result.created}, updated ${result.updated}, adopted ${result.adopted}). ` +
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
