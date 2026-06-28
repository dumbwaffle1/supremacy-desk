import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { offerFor, round2 } from "./lib/game";
import { stakeOf } from "./tournament";
import { requireLeagueAdmin } from "./leagues";
import { stageValidator } from "./schema";

/** Admin override of a game's rate — bypasses window + lock; re-prices trades. */
export const overrideMakerBid = mutation({
  args: {
    gameId: v.id("games"),
    bid: v.number(),
    quoteTeam: v.optional(v.union(v.literal("HOME"), v.literal("AWAY"))),
  },
  handler: async (ctx, { gameId, bid, quoteTeam }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) throw new Error("No such game.");
    const { actor } = await requireLeagueAdmin(ctx, game.leagueId);
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
      leagueId: game.leagueId,
      actor,
      action: "admin_override_bid",
      gameId,
      after: { bid: rounded, offer, quoteTeam: team },
    });
    return { bid: rounded, offer, quoteTeam: team };
  },
});

/** Admin set/override a player's trade. */
export const overrideTrade = mutation({
  args: {
    gameId: v.id("games"),
    player: v.string(),
    side: v.union(v.literal("BUY"), v.literal("SELL")),
  },
  handler: async (ctx, { gameId, player, side }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) throw new Error("No such game.");
    const { actor } = await requireLeagueAdmin(ctx, game.leagueId);
    if (game.bid === undefined) throw new Error("Set the maker rate first.");
    if (player === game.makerPlayer)
      throw new Error("The maker can't also be a taker.");

    const offer = offerFor(game.bid);
    const priceTaken = side === "BUY" ? offer : game.bid;
    const stake = await stakeOf(ctx, game.leagueId, game.stage);

    const existing = await ctx.db
      .query("trades")
      .withIndex("by_game_player", (q) =>
        q.eq("gameId", gameId).eq("player", player),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { side, priceTaken, stake, forcedLong: false });
    } else {
      await ctx.db.insert("trades", {
        leagueId: game.leagueId,
        gameId,
        player,
        side,
        priceTaken,
        stake,
        submittedAt: Date.now(),
      });
    }
    await ctx.db.insert("auditLogs", {
      leagueId: game.leagueId,
      actor,
      action: "admin_set_trade",
      gameId,
      after: { player, side, priceTaken },
    });
    return { player, side, priceTaken, stake };
  },
});

export const removeTrade = mutation({
  args: { gameId: v.id("games"), player: v.string() },
  handler: async (ctx, { gameId, player }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) throw new Error("No such game.");
    const { actor } = await requireLeagueAdmin(ctx, game.leagueId);
    const existing = await ctx.db
      .query("trades")
      .withIndex("by_game_player", (q) =>
        q.eq("gameId", gameId).eq("player", player),
      )
      .first();
    if (!existing) throw new Error("No trade to remove.");
    await ctx.db.delete(existing._id);
    await ctx.db.insert("auditLogs", {
      leagueId: game.leagueId,
      actor,
      action: "admin_remove_trade",
      gameId,
      before: { player, side: existing.side, priceTaken: existing.priceTaken },
    });
    return { ok: true as const };
  },
});

/* ── roster ───────────────────────────────────────────────────────────── */

export const addPlayer = mutation({
  args: { leagueId: v.id("leagues"), name: v.string() },
  handler: async (ctx, { leagueId, name }) => {
    const { actor } = await requireLeagueAdmin(ctx, leagueId);
    const trimmed = name.trim();
    if (trimmed.length < 1) throw new Error("Enter a name.");
    if (trimmed.length > 24) throw new Error("Keep the name under 24 characters.");
    const all = await ctx.db
      .query("players")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
    if (all.some((p) => p.name.toLowerCase() === trimmed.toLowerCase()))
      throw new Error("That name already exists.");
    await ctx.db.insert("players", { leagueId, name: trimmed });
    await ctx.db.insert("auditLogs", {
      leagueId,
      actor,
      action: "add_player",
      after: { name: trimmed },
    });
    return { ok: true as const };
  },
});

export const removePlayer = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (!player?.leagueId) throw new Error("No such player.");
    const { actor } = await requireLeagueAdmin(ctx, player.leagueId);
    if (player.claimedByUserId)
      throw new Error("That name is claimed — clear the claim first.");
    const games = await ctx.db
      .query("games")
      .withIndex("by_league", (q) => q.eq("leagueId", player.leagueId!))
      .collect();
    if (games.some((g) => g.makerPlayer === player.name))
      throw new Error("That player is a maker — reassign first.");
    await ctx.db.delete(playerId);
    await ctx.db.insert("auditLogs", {
      leagueId: player.leagueId,
      actor,
      action: "remove_player",
      before: { name: player.name },
    });
    return { ok: true as const };
  },
});

/* ── maker draw ───────────────────────────────────────────────────────── */

export const assignMakers = mutation({
  args: {
    leagueId: v.id("leagues"),
    assignments: v.array(
      v.object({ gameId: v.id("games"), player: v.string() }),
    ),
  },
  handler: async (ctx, { leagueId, assignments }) => {
    const { actor } = await requireLeagueAdmin(ctx, leagueId);
    const applied: { gameNo: number; player: string }[] = [];
    for (const a of assignments) {
      const game = await ctx.db.get(a.gameId);
      if (!game || game.leagueId !== leagueId) continue;
      if (game.status === "SETTLED" || game.status === "VOID") continue;
      await ctx.db.patch(a.gameId, { makerPlayer: a.player });
      applied.push({ gameNo: game.gameNo, player: a.player });
    }
    await ctx.db.insert("auditLogs", {
      leagueId,
      actor,
      action: "assign_makers",
      after: { assignments: applied },
    });
    return { count: applied.length };
  },
});

/* ── fixtures + stakes ────────────────────────────────────────────────── */

export const editFixture = mutation({
  args: {
    gameId: v.id("games"),
    home: v.optional(v.string()),
    away: v.optional(v.string()),
    koUtc: v.optional(v.number()),
  },
  handler: async (ctx, { gameId, home, away, koUtc }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) throw new Error("No such game.");
    const { actor } = await requireLeagueAdmin(ctx, game.leagueId);
    const patch: Partial<{ home: string; away: string; koUtc: number }> = {};
    if (home !== undefined) patch.home = home.trim();
    if (away !== undefined) patch.away = away.trim();
    if (koUtc !== undefined) patch.koUtc = koUtc;
    await ctx.db.patch(gameId, patch);
    await ctx.db.insert("auditLogs", {
      leagueId: game.leagueId,
      actor,
      action: "edit_fixture",
      gameId,
      after: patch,
    });
    return { ok: true as const };
  },
});

export const setStake = mutation({
  args: { leagueId: v.id("leagues"), stage: stageValidator, amount: v.number() },
  handler: async (ctx, { leagueId, stage, amount }) => {
    const { actor } = await requireLeagueAdmin(ctx, leagueId);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid amount.");
    const league = await ctx.db.get(leagueId);
    if (!league) throw new Error("No such league.");
    const stakes = league.stakes.filter((s) => s.stage !== stage);
    stakes.push({ stage, amount });
    await ctx.db.patch(leagueId, { stakes });
    await ctx.db.insert("auditLogs", {
      leagueId,
      actor,
      action: "set_stake",
      after: { stage, amount },
    });
    return { ok: true as const };
  },
});
