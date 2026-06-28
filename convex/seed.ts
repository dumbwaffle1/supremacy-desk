import { mutation, query, MutationCtx } from "./_generated/server";
import { PLAYERS, STAGES, STAKES, WIDTH, SETTLEMENT_BASIS } from "../src/config/constants";

const APP_TABLES = [
  "trades",
  "auditLogs",
  "games",
  "players",
  "tournaments",
] as const;

/** Wipe all app data (NOT auth tables). */
async function wipe(ctx: MutationCtx) {
  for (const table of APP_TABLES) {
    const rows = await ctx.db.query(table).collect();
    await Promise.all(rows.map((r) => ctx.db.delete(r._id)));
  }
}

/** Insert the tournament, 8 unclaimed players, and 8 placeholder R32 games. */
async function insertSeed(ctx: MutationCtx) {
  await ctx.db.insert("tournaments", {
    name: "WC2026 Knockouts",
    width: WIDTH,
    stakes: STAGES.map((stage) => ({ stage, amount: STAKES[stage] })),
    settlementBasis: SETTLEMENT_BASIS,
  });

  // 8 names as UNCLAIMED players (open roster; more can be added later).
  for (const name of PLAYERS) {
    await ctx.db.insert("players", {
      name,
      // claimedByUserId & addedByUserId left undefined = unclaimed / seeded
    });
  }

  // Placeholder R32 section-1 games. Makers in this EXACT order; teams + KO
  // times are filled by the fixture sync later (Prompt 3).
  for (let i = 0; i < PLAYERS.length; i++) {
    await ctx.db.insert("games", {
      gameNo: i + 1,
      stage: "R32",
      round: "Round of 32",
      status: "SCHEDULED",
      makerPlayer: PLAYERS[i],
    });
  }
}

/** Seed only if empty — safe to call repeatedly. */
export const seedIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("tournaments").first();
    if (existing) return { seeded: false as const };
    await insertSeed(ctx);
    return { seeded: true as const };
  },
});

/**
 * Dev-only: wipe app data and re-seed from scratch. Wired to a dev button on the
 * Admin screen. Does not touch auth/user tables.
 */
export const reseed = mutation({
  args: {},
  handler: async (ctx) => {
    await wipe(ctx);
    await insertSeed(ctx);
    return { ok: true as const };
  },
});

/** Counts so the UI / dashboard can confirm seeding. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const [players, games, tournaments] = await Promise.all([
      ctx.db.query("players").collect(),
      ctx.db.query("games").collect(),
      ctx.db.query("tournaments").collect(),
    ]);
    return {
      players: players.length,
      unclaimedPlayers: players.filter((p) => p.claimedByUserId === undefined).length,
      games: games.length,
      tournaments: tournaments.length,
      playerNames: players.map((p) => p.name),
    };
  },
});
