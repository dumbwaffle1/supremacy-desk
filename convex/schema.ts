import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Reusable enums.
export const stageValidator = v.union(
  v.literal("R32"),
  v.literal("R16"),
  v.literal("QF"),
  v.literal("SF"),
  v.literal("3PO"),
  v.literal("F"),
);

export const gameStatusValidator = v.union(
  v.literal("SCHEDULED"),
  v.literal("LIVE"),
  v.literal("FT"),
  v.literal("SETTLED"),
  v.literal("VOID"),
);

export const sideValidator = v.union(v.literal("BUY"), v.literal("SELL"));

// Data model — see supremacy-build-spec.md §4. createdAt is covered by Convex's
// built-in `_creationTime` on every document, so it isn't stored explicitly.
export default defineSchema({
  ...authTables,

  // Convex Auth's `users` table, inlined so we can add our own fields.
  // The library-required fields + the `email`/`phone` indexes must stay.
  users: defineTable({
    // --- managed by Convex Auth ---
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // --- ours ---
    displayName: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
    // Name of the Player this account has claimed (mirror of Player.claimedByUserId).
    playerName: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  // Open roster: a name can exist UNCLAIMED (claimedByUserId undefined), then a
  // login claims it — or a new name is added. addedByUserId is undefined for the
  // seeded roster.
  players: defineTable({
    name: v.string(),
    claimedByUserId: v.optional(v.id("users")),
    addedByUserId: v.optional(v.id("users")),
  })
    .index("by_name", ["name"])
    .index("by_claimedBy", ["claimedByUserId"]),

  tournaments: defineTable({
    name: v.string(),
    width: v.number(),
    // Stored as a list because Convex object keys must be valid identifiers and
    // "3PO" isn't one. Stage stays a value; amount is £/goal.
    stakes: v.array(v.object({ stage: stageValidator, amount: v.number() })),
    settlementBasis: v.string(),
  }),

  games: defineTable({
    fixtureId: v.optional(v.number()), // API-Football fixture id (set by sync)
    gameNo: v.number(),
    stage: stageValidator,
    round: v.optional(v.string()), // API round string, e.g. "Round of 32"
    home: v.optional(v.string()),
    away: v.optional(v.string()),
    koUtc: v.optional(v.number()), // ms epoch UTC; unknown until fixture sync
    status: gameStatusValidator,

    makerPlayer: v.optional(v.string()),
    // The team the price is quoted ON. bid/offer are that team's supremacy
    // (teamGoals − oppGoals), in positive terms for a favourite. Default HOME.
    quoteTeam: v.optional(v.union(v.literal("HOME"), v.literal("AWAY"))),
    bid: v.optional(v.number()), // offer = bid + WIDTH (derived, not stored)
    makerSubmittedAt: v.optional(v.number()),
    defaultedMaker: v.optional(v.boolean()),

    // Settlement — post-extra-time score (penalties excluded). See spec §3.
    settleHome: v.optional(v.number()),
    settleAway: v.optional(v.number()),
    settledAt: v.optional(v.number()),

    // Live score cache, refreshed by the settlement poll (Prompt 7).
    liveHome: v.optional(v.number()),
    liveAway: v.optional(v.number()),
    liveStatusShort: v.optional(v.string()),
    // Settle only when a final score repeats across two polls (ignore transients).
    settleCandidateHome: v.optional(v.number()),
    settleCandidateAway: v.optional(v.number()),
  })
    .index("by_gameNo", ["gameNo"])
    .index("by_stage", ["stage"])
    .index("by_status", ["status"])
    .index("by_fixtureId", ["fixtureId"]),

  trades: defineTable({
    gameId: v.id("games"),
    player: v.string(),
    side: sideValidator,
    priceTaken: v.number(), // BUY = offer, SELL = bid (snapshot at submit)
    stake: v.number(), // £/goal for the game's stage
    forcedLong: v.optional(v.boolean()),
    pnl: v.optional(v.number()), // filled at settlement
    submittedAt: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_player", ["player"])
    .index("by_game_player", ["gameId", "player"]),

  auditLogs: defineTable({
    actor: v.string(), // email / player / "system"
    action: v.string(),
    gameId: v.optional(v.id("games")),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
  }).index("by_game", ["gameId"]),
});
