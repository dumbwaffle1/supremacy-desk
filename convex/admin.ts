import { v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { offerFor, round2, stakeForStage } from "./lib/game";
import { ADMIN_EMAIL } from "../src/config/constants";

/** Authenticated admin guard. Returns a label for the audit `actor` field. */
export async function requireAdmin(ctx: MutationCtx): Promise<{ actor: string }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in first.");
  const user = await ctx.db.get(userId);
  const isAdmin =
    !!user?.isAdmin ||
    (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (!isAdmin) throw new Error("Admins only.");
  return { actor: user?.email ?? "admin" };
}

/**
 * Admin override of a game's maker rate — bypasses the window + the one-shot
 * lock (e.g. a maker quoted in the group chat before the app existed). Audited.
 */
export const overrideMakerBid = mutation({
  args: {
    gameId: v.id("games"),
    bid: v.number(),
    quoteTeam: v.optional(v.union(v.literal("HOME"), v.literal("AWAY"))),
  },
  handler: async (ctx, { gameId, bid, quoteTeam }) => {
    const { actor } = await requireAdmin(ctx);
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("No such game.");
    if (!Number.isFinite(bid)) throw new Error("Enter a valid number.");
    const rounded = round2(bid);
    if (rounded < -20 || rounded > 20) throw new Error("Bid out of range.");
    const team = quoteTeam ?? "HOME";

    await ctx.db.patch(gameId, {
      bid: rounded,
      quoteTeam: team,
      makerSubmittedAt: Date.now(),
      defaultedMaker: false,
    });
    // Single rate per game → re-price existing trades to the corrected rate
    // (BUY at the offer, SELL at the bid). Keeps priceTaken consistent.
    const offer = offerFor(rounded);
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    await Promise.all(
      trades.map((t) =>
        ctx.db.patch(t._id, { priceTaken: t.side === "BUY" ? offer : rounded }),
      ),
    );

    await ctx.db.insert("auditLogs", {
      actor,
      action: "admin_override_bid",
      gameId,
      before: {
        bid: game.bid ?? null,
        quoteTeam: game.quoteTeam ?? null,
        defaultedMaker: game.defaultedMaker ?? false,
      },
      after: { bid: rounded, offer, quoteTeam: team },
    });
    return { bid: rounded, offer, quoteTeam: team };
  },
});

/**
 * Admin set/override a player's trade — bypasses deadlines + the one-per-game
 * lock, and works for players who haven't logged in yet. Audited.
 */
export const overrideTrade = mutation({
  args: {
    gameId: v.id("games"),
    player: v.string(),
    side: v.union(v.literal("BUY"), v.literal("SELL")),
  },
  handler: async (ctx, { gameId, player, side }) => {
    const { actor } = await requireAdmin(ctx);
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("No such game.");
    if (game.bid === undefined) throw new Error("Set the maker rate first.");
    if (player === game.makerPlayer)
      throw new Error("The maker can't also be a taker.");

    const offer = offerFor(game.bid);
    const priceTaken = side === "BUY" ? offer : game.bid;
    const stake = stakeForStage(game.stage);

    const existing = await ctx.db
      .query("trades")
      .withIndex("by_game_player", (q) =>
        q.eq("gameId", gameId).eq("player", player),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        side,
        priceTaken,
        stake,
        forcedLong: false,
      });
      await ctx.db.insert("auditLogs", {
        actor,
        action: "admin_override_trade",
        gameId,
        before: { player, side: existing.side, priceTaken: existing.priceTaken },
        after: { player, side, priceTaken },
      });
    } else {
      await ctx.db.insert("trades", {
        gameId,
        player,
        side,
        priceTaken,
        stake,
        submittedAt: Date.now(),
      });
      await ctx.db.insert("auditLogs", {
        actor,
        action: "admin_add_trade",
        gameId,
        after: { player, side, priceTaken },
      });
    }
    return { player, side, priceTaken, stake };
  },
});

/** Admin remove a player's trade (e.g. entered in error). Audited. */
export const removeTrade = mutation({
  args: { gameId: v.id("games"), player: v.string() },
  handler: async (ctx, { gameId, player }) => {
    const { actor } = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("trades")
      .withIndex("by_game_player", (q) =>
        q.eq("gameId", gameId).eq("player", player),
      )
      .first();
    if (!existing) throw new Error("No trade to remove.");

    await ctx.db.delete(existing._id);
    await ctx.db.insert("auditLogs", {
      actor,
      action: "admin_remove_trade",
      gameId,
      before: { player, side: existing.side, priceTaken: existing.priceTaken },
    });
    return { ok: true as const };
  },
});
