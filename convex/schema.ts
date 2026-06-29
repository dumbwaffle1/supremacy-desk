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

// Multi-tenant: every competition is a "league" (a Supremacy). All game data is
// scoped by leagueId. leagueId is optional only to keep the one-time migration
// of pre-multi-tenant rows valid; new rows always set it.
export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    displayName: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()), // global super-admin
    playerName: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  // A competition instance ("Supremacy"). The owner is its admin.
  leagues: defineTable({
    name: v.string(),
    tournament: v.string(), // "WC2026"
    width: v.number(),
    stakes: v.array(v.object({ stage: stageValidator, amount: v.number() })),
    settlementBasis: v.string(),
    ownerUserId: v.optional(v.id("users")),
    inviteCode: v.string(),
  })
    .index("by_invite", ["inviteCode"])
    .index("by_owner", ["ownerUserId"]),

  // Per-user notification preferences (global across leagues).
  notifPrefs: defineTable({
    userId: v.id("users"),
    maker: v.boolean(), // "rate due" reminders
    taker: v.boolean(), // "trade closes at KO" reminders
    settlement: v.boolean(), // end-of-game outcome summaries
    tradeOnRate: v.optional(v.boolean()), // "someone traded on your rate" (default on)
  }).index("by_user", ["userId"]),

  // League activity feed + chat. Auto-posted "rate"/"trade" lines and free-text
  // "chat" messages share one stream, ordered by _creationTime.
  feed: defineTable({
    leagueId: v.id("leagues"),
    kind: v.union(v.literal("rate"), v.literal("trade"), v.literal("chat")),
    actor: v.optional(v.string()), // player name, or chat author display name
    authorUserId: v.optional(v.id("users")), // who acted/posted (own-vs-unread)
    gameId: v.optional(v.id("games")),
    matchup: v.optional(v.string()), // "France v Canada" snapshot
    team: v.optional(v.string()), // quoted team (rate/trade)
    bid: v.optional(v.number()),
    offer: v.optional(v.number()),
    side: v.optional(sideValidator), // trade
    price: v.optional(v.number()), // trade price taken
    text: v.optional(v.string()), // chat body
    at: v.optional(v.number()), // original event time (backfill); else use _creationTime
  }).index("by_league", ["leagueId"]),

  // Per-user, per-league last-seen feed time → drives the unread badge.
  feedReads: defineTable({
    leagueId: v.id("leagues"),
    userId: v.id("users"),
    lastSeen: v.number(),
  }).index("by_league_user", ["leagueId", "userId"]),

  // Web-push subscriptions (one device per row).
  pushSubs: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // De-dup sent reminders (one per user/game/kind).
  notifsSent: defineTable({
    userId: v.id("users"),
    gameId: v.id("games"),
    kind: v.string(), // "maker" | "taker" | "settle"
  }).index("by_key", ["userId", "gameId", "kind"]),

  // A user has joined a league (may or may not have claimed a seat yet).
  memberships: defineTable({
    leagueId: v.id("leagues"),
    userId: v.id("users"),
  })
    .index("by_user", ["userId"])
    .index("by_league_user", ["leagueId", "userId"]),

  // Open roster, scoped to a league.
  players: defineTable({
    leagueId: v.optional(v.id("leagues")),
    name: v.string(),
    claimedByUserId: v.optional(v.id("users")),
    addedByUserId: v.optional(v.id("users")),
  })
    .index("by_name", ["name"])
    .index("by_claimedBy", ["claimedByUserId"])
    .index("by_league", ["leagueId"])
    .index("by_league_claimedBy", ["leagueId", "claimedByUserId"]),

  // Legacy single-tenant config (superseded by leagues; kept so migration's
  // existing rows stay valid — no longer read).
  tournaments: defineTable({
    name: v.string(),
    width: v.number(),
    stakes: v.array(v.object({ stage: stageValidator, amount: v.number() })),
    settlementBasis: v.string(),
  }),

  games: defineTable({
    leagueId: v.optional(v.id("leagues")),
    fixtureId: v.optional(v.number()),
    gameNo: v.number(),
    stage: stageValidator,
    round: v.optional(v.string()),
    home: v.optional(v.string()),
    away: v.optional(v.string()),
    koUtc: v.optional(v.number()),
    status: gameStatusValidator,

    makerPlayer: v.optional(v.string()),
    // Admin set this maker by hand → don't let the standings auto-assigner change it.
    makerManual: v.optional(v.boolean()),
    quoteTeam: v.optional(v.union(v.literal("HOME"), v.literal("AWAY"))),
    bid: v.optional(v.number()),
    makerSubmittedAt: v.optional(v.number()),
    defaultedMaker: v.optional(v.boolean()),

    settleHome: v.optional(v.number()),
    settleAway: v.optional(v.number()),
    settledAt: v.optional(v.number()),

    liveHome: v.optional(v.number()),
    liveAway: v.optional(v.number()),
    liveStatusShort: v.optional(v.string()),
    settleCandidateHome: v.optional(v.number()),
    settleCandidateAway: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_fixtureId", ["fixtureId"])
    .index("by_league", ["leagueId"])
    .index("by_league_status", ["leagueId", "status"]),

  trades: defineTable({
    leagueId: v.optional(v.id("leagues")),
    gameId: v.id("games"),
    player: v.string(),
    side: sideValidator,
    priceTaken: v.number(),
    stake: v.number(),
    forcedLong: v.optional(v.boolean()),
    pnl: v.optional(v.number()),
    submittedAt: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_player", ["player"])
    .index("by_game_player", ["gameId", "player"]),

  auditLogs: defineTable({
    leagueId: v.optional(v.id("leagues")),
    actor: v.string(),
    action: v.string(),
    gameId: v.optional(v.id("games")),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
  })
    .index("by_game", ["gameId"])
    .index("by_league", ["leagueId"]),

  payments: defineTable({
    leagueId: v.optional(v.id("leagues")),
    fromPlayer: v.string(),
    toPlayer: v.string(),
    amount: v.number(),
    ts: v.number(),
  })
    .index("by_pair", ["fromPlayer", "toPlayer"])
    .index("by_league", ["leagueId"]),

  ledgerSnapshots: defineTable({
    leagueId: v.optional(v.id("leagues")),
    by: v.string(),
    balances: v.array(v.object({ player: v.string(), net: v.number() })),
    transfers: v.array(
      v.object({ from: v.string(), to: v.string(), amount: v.number() }),
    ),
  }).index("by_league", ["leagueId"]),
});
