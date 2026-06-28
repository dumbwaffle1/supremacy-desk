import { v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { offerFor, round2 } from "./lib/game";
import { stakeOf } from "./tournament";
import { stageValidator } from "./schema";
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
    const stake = await stakeOf(ctx, game.stage);

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

/* ── roster ───────────────────────────────────────────────────────────── */

/** Add a new (unclaimed) roster name. Audited. */
export const addPlayer = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const { actor } = await requireAdmin(ctx);
    const trimmed = name.trim();
    if (trimmed.length < 1) throw new Error("Enter a name.");
    if (trimmed.length > 24) throw new Error("Keep the name under 24 characters.");
    const all = await ctx.db.query("players").collect();
    if (all.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("That name already exists.");
    }
    await ctx.db.insert("players", { name: trimmed });
    await ctx.db.insert("auditLogs", {
      actor,
      action: "add_player",
      after: { name: trimmed },
    });
    return { ok: true as const };
  },
});

/** Remove an UNCLAIMED player who isn't assigned as a maker anywhere. Audited. */
export const removePlayer = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const { actor } = await requireAdmin(ctx);
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("No such player.");
    if (player.claimedByUserId)
      throw new Error("That name is claimed — clear the claim first.");
    const games = await ctx.db.query("games").collect();
    if (games.some((g) => g.makerPlayer === player.name)) {
      throw new Error("That player is a maker on a game — reassign first.");
    }
    await ctx.db.delete(playerId);
    await ctx.db.insert("auditLogs", {
      actor,
      action: "remove_player",
      before: { name: player.name },
    });
    return { ok: true as const };
  },
});

/* ── maker draw ───────────────────────────────────────────────────────── */

/** Lock a proposed maker assignment for a set of games (the draw). Audited. */
export const assignMakers = mutation({
  args: {
    assignments: v.array(
      v.object({ gameId: v.id("games"), player: v.string() }),
    ),
  },
  handler: async (ctx, { assignments }) => {
    const { actor } = await requireAdmin(ctx);
    const applied: { gameNo: number; player: string }[] = [];
    for (const a of assignments) {
      const game = await ctx.db.get(a.gameId);
      if (!game) continue;
      if (game.status === "SETTLED" || game.status === "VOID") continue;
      await ctx.db.patch(a.gameId, { makerPlayer: a.player });
      applied.push({ gameNo: game.gameNo, player: a.player });
    }
    await ctx.db.insert("auditLogs", {
      actor,
      action: "assign_makers",
      after: { assignments: applied },
    });
    return { count: applied.length };
  },
});

/* ── fixtures + stakes ────────────────────────────────────────────────── */

/** Edit a game's teams / kick-off when the feed is wrong. Audited. */
export const editFixture = mutation({
  args: {
    gameId: v.id("games"),
    home: v.optional(v.string()),
    away: v.optional(v.string()),
    koUtc: v.optional(v.number()),
  },
  handler: async (ctx, { gameId, home, away, koUtc }) => {
    const { actor } = await requireAdmin(ctx);
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("No such game.");
    const patch: Partial<{ home: string; away: string; koUtc: number }> = {};
    if (home !== undefined) patch.home = home.trim();
    if (away !== undefined) patch.away = away.trim();
    if (koUtc !== undefined) patch.koUtc = koUtc;
    await ctx.db.patch(gameId, patch);
    await ctx.db.insert("auditLogs", {
      actor,
      action: "edit_fixture",
      gameId,
      before: { home: game.home ?? null, away: game.away ?? null, koUtc: game.koUtc ?? null },
      after: patch,
    });
    return { ok: true as const };
  },
});

/** Edit the £/goal stake for a stage (affects new trades). Audited. */
export const setStake = mutation({
  args: { stage: stageValidator, amount: v.number() },
  handler: async (ctx, { stage, amount }) => {
    const { actor } = await requireAdmin(ctx);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid amount.");
    const tour = await ctx.db.query("tournaments").first();
    if (!tour) throw new Error("No tournament — seed first.");
    const stakes = tour.stakes.filter((s) => s.stage !== stage);
    stakes.push({ stage, amount });
    await ctx.db.patch(tour._id, { stakes });
    await ctx.db.insert("auditLogs", {
      actor,
      action: "set_stake",
      after: { stage, amount },
    });
    return { ok: true as const };
  },
});
