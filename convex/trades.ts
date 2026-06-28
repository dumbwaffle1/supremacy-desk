import { v } from "convex/values";
import { mutation, internalMutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { offerFor, round2, stakeForStage } from "./lib/game";
import {
  DEFAULT_BID,
  makerDefaultDue,
  makerWindowOpen,
  takerWindowOpen,
} from "./lib/trading";

/** Resolve the caller's claimed player name from the auth context (never trust
 *  a client-sent name — spec §2). */
async function requireClaimedPlayer(
  ctx: QueryCtx,
): Promise<{ userId: import("./_generated/dataModel").Id<"users">; player: string }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in first.");
  const player = await ctx.db
    .query("players")
    .withIndex("by_claimedBy", (q) => q.eq("claimedByUserId", userId))
    .first();
  if (!player) throw new Error("Claim a seat first.");
  return { userId, player: player.name };
}

/** Maker submits a single bid on a chosen team; offer = bid + WIDTH. */
export const submitBid = mutation({
  args: {
    gameId: v.id("games"),
    bid: v.number(),
    quoteTeam: v.optional(v.union(v.literal("HOME"), v.literal("AWAY"))),
  },
  handler: async (ctx, { gameId, bid, quoteTeam }) => {
    const { player } = await requireClaimedPlayer(ctx);
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("No such game.");
    if (game.status === "SETTLED" || game.status === "VOID")
      throw new Error("This game is closed.");
    if (game.makerPlayer !== player)
      throw new Error("You're not the maker for this game.");
    if (!makerWindowOpen(Date.now(), game.koUtc))
      throw new Error("The maker window has closed (under 60 min to kick-off).");
    // Amendable until someone trades on it, then locked.
    const anyTrade = await ctx.db
      .query("trades")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .first();
    if (anyTrade) throw new Error("Rate is locked — someone has already traded.");

    if (!Number.isFinite(bid)) throw new Error("Enter a valid number.");
    const rounded = round2(bid);
    if (rounded < -20 || rounded > 20) throw new Error("Bid out of range.");

    await ctx.db.patch(gameId, {
      bid: rounded,
      quoteTeam: quoteTeam ?? "HOME",
      makerSubmittedAt: Date.now(),
    });
    return { bid: rounded, offer: offerFor(rounded), quoteTeam: quoteTeam ?? "HOME" };
  },
});

/** Taker BUYs (long @ offer) or SELLs (short @ bid); one action per game; locked. */
export const submitTrade = mutation({
  args: { gameId: v.id("games"), side: v.union(v.literal("BUY"), v.literal("SELL")) },
  handler: async (ctx, { gameId, side }) => {
    const { player } = await requireClaimedPlayer(ctx);
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("No such game.");
    if (game.status === "SETTLED" || game.status === "VOID")
      throw new Error("This game is closed.");
    if (game.makerPlayer === player)
      throw new Error("You're the maker — you can't trade your own game.");
    if (game.bid === undefined)
      throw new Error("No rate yet — wait for the maker to quote.");
    if (!takerWindowOpen(Date.now(), game.koUtc))
      throw new Error("Trading has closed (kick-off passed).");

    const existing = await ctx.db
      .query("trades")
      .withIndex("by_game_player", (q) =>
        q.eq("gameId", gameId).eq("player", player),
      )
      .first();
    if (existing) throw new Error("You've already traded this game (locked).");

    const offer = offerFor(game.bid);
    const priceTaken = side === "BUY" ? offer : game.bid;
    const stake = stakeForStage(game.stage);

    await ctx.db.insert("trades", {
      gameId,
      player,
      side,
      priceTaken,
      stake,
      submittedAt: Date.now(),
    });
    return { side, priceTaken, stake };
  },
});

/** One-off cleanup: re-price every trade to its game's current bid/offer
 *  (BUY → offer, SELL → bid). Fixes prices snapshotted under an older model. */
export const repriceTrades = internalMutation({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    let repriced = 0;
    for (const game of games) {
      if (game.bid === undefined) continue;
      const offer = offerFor(game.bid);
      const trades = await ctx.db
        .query("trades")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();
      for (const t of trades) {
        const price = t.side === "BUY" ? offer : game.bid;
        if (t.priceTaken !== price) {
          await ctx.db.patch(t._id, { priceTaken: price });
          repriced++;
        }
      }
    }
    return { repriced };
  },
});

/** All trades for a game (the book). */
export const forGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return await ctx.db
      .query("trades")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
  },
});

/**
 * Apply deadline penalties (spec §7), run by a short cron:
 *  - at KO − 60min with no maker rate → default bid 0.0 / offer 0.2 + defaultedMaker
 *  - at KO, any non-maker roster player with no trade → forced long @ offer
 * Idempotent: skips games already handled, never double-creates trades.
 */
export const applyDeadlinePenalties = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const now = Date.now();
    const games = await ctx.db.query("games").collect();
    const players = await ctx.db.query("players").collect();
    let defaults = 0;
    let forced = 0;

    for (const game of games) {
      if (game.status === "SETTLED" || game.status === "VOID") continue;
      if (game.koUtc === undefined) continue;

      // 1) Default the maker rate if missing past the window.
      if (game.bid === undefined && makerDefaultDue(now, game.koUtc)) {
        await ctx.db.patch(game._id, {
          bid: DEFAULT_BID,
          quoteTeam: "HOME",
          makerSubmittedAt: now,
          defaultedMaker: true,
        });
        game.bid = DEFAULT_BID;
        defaults++;
        await ctx.db.insert("auditLogs", {
          actor: "system",
          action: "maker_defaulted",
          gameId: game._id,
          after: { bid: DEFAULT_BID, offer: offerFor(DEFAULT_BID) },
        });
      }

      // 2) Force-long any non-maker player who hasn't traded by KO.
      if (now >= game.koUtc && game.bid !== undefined) {
        const offer = offerFor(game.bid);
        const stake = stakeForStage(game.stage);
        const trades = await ctx.db
          .query("trades")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect();
        const traded = new Set(trades.map((t) => t.player));

        for (const p of players) {
          if (p.name === game.makerPlayer) continue;
          if (traded.has(p.name)) continue;
          await ctx.db.insert("trades", {
            gameId: game._id,
            player: p.name,
            side: "BUY",
            priceTaken: offer,
            stake,
            forcedLong: true,
            submittedAt: now,
          });
          forced++;
        }
      }
    }

    return { defaults, forced };
  },
});
