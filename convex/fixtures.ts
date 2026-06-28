import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { stageValidator } from "./schema";
import type { Stage } from "../src/config/constants";

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE = 1; // FIFA World Cup
const SEASON = 2026;

// Stage ordering used to assign a stable, global gameNo.
const STAGE_ORDER: Record<Stage, number> = {
  R32: 0,
  R16: 1,
  QF: 2,
  SF: 3,
  "3PO": 4,
  F: 5,
};

/** Map an API-Football `league.round` string to our stage, or null to skip
 *  (group stage / unknown). Matched loosely so minor wording changes still work. */
export function roundToStage(round: string): Stage | null {
  const r = round.toLowerCase();
  if (r.includes("round of 32") || r.includes("1/16")) return "R32";
  if (r.includes("round of 16") || r.includes("1/8")) return "R16";
  if (r.includes("quarter")) return "QF";
  if (r.includes("semi")) return "SF";
  if (r.includes("3rd") || r.includes("third") || r.includes("play-off for third"))
    return "3PO";
  if (r.trim() === "final" || r.endsWith(" final")) return "F";
  return null;
}

/** API-Football status.short -> our stored Game.status. */
function mapStatus(short: string): "SCHEDULED" | "LIVE" | "FT" {
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(short))
    return "LIVE";
  if (["FT", "AET", "PEN"].includes(short)) return "FT";
  return "SCHEDULED"; // NS, TBD, PST, CANC, ABD, WO, AWD, …
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
        // Don't downgrade a game we've already settled/voided.
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
        ph.fixtureId = f.fixtureId; // so it isn't adopted twice this run
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

/** Fetch the knockout fixture list and upsert. Run by cron + admin button. */
export const sync = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key) {
      console.error(
        "[fixtures] API_FOOTBALL_KEY not set. Run: npx convex env set API_FOOTBALL_KEY <key>",
      );
      return { ok: false, error: "API_FOOTBALL_KEY not set" };
    }

    const url = `${API_BASE}/fixtures?league=${LEAGUE}&season=${SEASON}`;
    const res = await fetch(url, { headers: { "x-apisports-key": key } });

    // Always surface quota so usage can be watched in the logs.
    console.log(
      `[fixtures] quota — day ${res.headers.get(
        "x-ratelimit-requests-remaining",
      )}/${res.headers.get("x-ratelimit-requests-limit")} left · minute ${res.headers.get(
        "X-RateLimit-Remaining",
      )}/${res.headers.get("X-RateLimit-Limit")} left`,
    );

    if (!res.ok) {
      console.error(`[fixtures] HTTP ${res.status}: ${await res.text()}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as {
      errors?: unknown;
      results?: number;
      response?: Array<{
        fixture: { id: number; date: string; status: { short: string } };
        teams: { home?: { name?: string }; away?: { name?: string } };
        league: { round: string };
      }>;
    };

    const errs = json.errors;
    const hasErrors = Array.isArray(errs)
      ? errs.length > 0
      : errs && typeof errs === "object" && Object.keys(errs).length > 0;
    if (hasErrors) {
      console.error(`[fixtures] API errors: ${JSON.stringify(errs)}`);
      return { ok: false, error: "api errors", details: errs };
    }

    const items = json.response ?? [];
    const skippedRounds = new Set<string>();
    const fixtures = [];
    for (const it of items) {
      const round = it.league?.round ?? "";
      const stage = roundToStage(round);
      if (!stage) {
        skippedRounds.add(round);
        continue;
      }
      fixtures.push({
        fixtureId: it.fixture.id,
        round,
        stage,
        home: it.teams?.home?.name ?? undefined,
        away: it.teams?.away?.name ?? undefined,
        koUtc: it.fixture?.date ? Date.parse(it.fixture.date) : undefined,
        statusShort: it.fixture?.status?.short ?? "NS",
      });
    }

    const result = await ctx.runMutation(internal.fixtures.upsertFromApi, {
      fixtures,
    });
    console.log(
      `[fixtures] synced ${fixtures.length} knockout fixtures of ${items.length} returned ` +
        `(created ${result.created}, updated ${result.updated}, adopted ${result.adopted}). ` +
        `Skipped rounds: ${[...skippedRounds].join(", ") || "none"}`,
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
