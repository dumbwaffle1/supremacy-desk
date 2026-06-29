import { v } from "convex/values";
import {
  mutation,
  internalMutation,
  query,
  MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { ADMIN_EMAIL } from "../src/config/constants";
import { postFeed } from "./feed";
import { offerFor, round2 } from "./lib/game";
import { getStakes, stakeOf } from "./tournament";
import {
  DEFAULT_BID,
  makerDefaultDue,
  makerWindowOpen,
  takerWindowOpen,
} from "./lib/trading";

/** The caller's claimed player name in a league (from the auth context). */
async function claimedPlayer(
  ctx: MutationCtx,
  leagueId: Id<"leagues">,
): Promise<{ userId: Id<"users">; player: string }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in first.");
  const player = await ctx.db
    .query("players")
    .withIndex("by_league_claimedBy", (q) =>
      q.eq("leagueId", leagueId).eq("claimedByUserId", userId),
    )
    .first();
  if (!player) throw new Error("Claim a seat first.");
  return { userId, player: player.name };
}

/** Push the maker when a taker trades on their rate (respects the pref; opt-out only). */
async function notifyMakerOfTrade(
  ctx: MutationCtx,
  game: Doc<"games">,
  taker: string,
  side: "BUY" | "SELL",
  team: string,
  price: number,
) {
  if (!game.leagueId || !game.makerPlayer || game.makerPlayer === taker) return;
  const roster = await ctx.db
    .query("players")
    .withIndex("by_league", (q) => q.eq("leagueId", game.leagueId!))
    .collect();
  const makerUserId = roster.find((p) => p.name === game.makerPlayer)?.claimedByUserId;
  if (!makerUserId) return;

  const pref = await ctx.db
    .query("notifPrefs")
    .withIndex("by_user", (q) => q.eq("userId", makerUserId))
    .first();
  if (pref && pref.tradeOnRate === false) return; // default (undefined) = on

  const sub = await ctx.db
    .query("pushSubs")
    .withIndex("by_user", (q) => q.eq("userId", makerUserId))
    .first();
  if (!sub) return;

  await ctx.scheduler.runAfter(0, internal.pushNode.send, {
    userId: makerUserId,
    title: "Trade on your rate",
    body: `${taker} ${side} ${team} @ ${price.toFixed(1)}`,
    url: `/l/${game.leagueId}/games/${game._id}`,
  });
}

/** Maker submits a single bid on a chosen team; offer = bid + WIDTH. */
export const submitBid = mutation({
  args: {
    gameId: v.id("games"),
    bid: v.number(),
    quoteTeam: v.optional(v.union(v.literal("HOME"), v.literal("AWAY"))),
  },
  handler: async (ctx, { gameId, bid, quoteTeam }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) throw new Error("No such game.");
    const { userId, player } = await claimedPlayer(ctx, game.leagueId);
    if (game.status === "SETTLED" || game.status === "VOID")
      throw new Error("This game is closed.");
    if (game.makerPlayer !== player)
      throw new Error("You're not the maker for this game.");
    if (!makerWindowOpen(Date.now(), game.koUtc))
      throw new Error("The maker window has closed (under 60 min to kick-off).");
    const anyTrade = await ctx.db
      .query("trades")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .first();
    if (anyTrade) throw new Error("Rate is locked — someone has already traded.");

    if (!Number.isFinite(bid)) throw new Error("Enter a valid number.");
    const rounded = round2(bid);
    if (rounded < -20 || rounded > 20) throw new Error("Bid out of range.");

    const qt = quoteTeam ?? "HOME";
    await ctx.db.patch(gameId, {
      bid: rounded,
      quoteTeam: qt,
      makerSubmittedAt: Date.now(),
    });
    const team = qt === "AWAY" ? (game.away ?? "Away") : (game.home ?? "Home");
    await postFeed(ctx, {
      leagueId: game.leagueId,
      kind: "rate",
      actor: player,
      authorUserId: userId,
      gameId,
      matchup: `${game.home ?? "?"} v ${game.away ?? "?"}`,
      team,
      bid: rounded,
      offer: offerFor(rounded),
    });
    return { bid: rounded, offer: offerFor(rounded), quoteTeam: qt };
  },
});

/** Taker BUYs (long @ offer) or SELLs (short @ bid); one action per game. */
export const submitTrade = mutation({
  args: { gameId: v.id("games"), side: v.union(v.literal("BUY"), v.literal("SELL")) },
  handler: async (ctx, { gameId, side }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) throw new Error("No such game.");
    const { userId, player } = await claimedPlayer(ctx, game.leagueId);
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
    const stake = await stakeOf(ctx, game.leagueId, game.stage);

    await ctx.db.insert("trades", {
      leagueId: game.leagueId,
      gameId,
      player,
      side,
      priceTaken,
      stake,
      submittedAt: Date.now(),
    });

    const quoteTeam = game.quoteTeam ?? "HOME";
    const team = quoteTeam === "AWAY" ? (game.away ?? "Away") : (game.home ?? "Home");
    await postFeed(ctx, {
      leagueId: game.leagueId,
      kind: "trade",
      actor: player,
      authorUserId: userId,
      gameId,
      matchup: `${game.home ?? "?"} v ${game.away ?? "?"}`,
      team,
      side,
      price: priceTaken,
    });
    await notifyMakerOfTrade(ctx, game, player, side, team, priceTaken);

    return { side, priceTaken, stake };
  },
});

/** Clear a game's rate. Maker (window open, untraded) or the league owner
 *  (anytime — also clears trades). Audited when done by an owner. */
export const clearBid = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) throw new Error("No such game.");
    if (game.status === "SETTLED" || game.status === "VOID")
      throw new Error("This game is closed.");

    const user = await ctx.db.get(userId);
    const league = await ctx.db.get(game.leagueId);
    const isAdmin =
      league?.ownerUserId === userId ||
      !!user?.isAdmin ||
      (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const claimed = await ctx.db
      .query("players")
      .withIndex("by_league_claimedBy", (q) =>
        q.eq("leagueId", game.leagueId!).eq("claimedByUserId", userId),
      )
      .first();
    const isMaker = claimed?.name === game.makerPlayer;

    const trades = await ctx.db
      .query("trades")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    if (!isAdmin) {
      if (!isMaker) throw new Error("Only the maker or the owner can clear this.");
      if (!makerWindowOpen(Date.now(), game.koUtc))
        throw new Error("The maker window has closed.");
      if (trades.length > 0) throw new Error("Locked — someone has already traded.");
    } else {
      await Promise.all(trades.map((t) => ctx.db.delete(t._id)));
    }

    await ctx.db.patch(gameId, {
      bid: undefined,
      quoteTeam: undefined,
      makerSubmittedAt: undefined,
      defaultedMaker: undefined,
    });
    if (isAdmin) {
      await ctx.db.insert("auditLogs", {
        leagueId: game.leagueId,
        actor: user?.email ?? "owner",
        action: "clear_rate",
        gameId,
        before: { bid: game.bid ?? null, clearedTrades: trades.length },
      });
    }
    return { ok: true as const };
  },
});

/** One-off: re-price every trade to its game's current bid/offer. */
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

/** One-off: remove any trade by a game's own maker (the maker can't be a taker).
 *  Fixes rows created by forced-longs before a maker was assigned. */
export const fixMakerTrades = internalMutation({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    let removed = 0;
    for (const g of games) {
      if (!g.makerPlayer) continue;
      const selfTrades = await ctx.db
        .query("trades")
        .withIndex("by_game_player", (q) =>
          q.eq("gameId", g._id).eq("player", g.makerPlayer!),
        )
        .collect();
      for (const t of selfTrades) {
        await ctx.db.delete(t._id);
        removed++;
      }
    }
    return { removed };
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
 * Deadline penalties across all leagues' games: default a missing maker rate,
 * force-long non-trading roster players (scoped to each game's league).
 */
export const applyDeadlinePenalties = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const now = Date.now();
    const games = await ctx.db.query("games").collect();
    let defaults = 0;
    let forced = 0;

    for (const game of games) {
      if (!game.leagueId) continue;
      if (game.status === "SETTLED" || game.status === "VOID") continue;
      if (game.koUtc === undefined) continue;
      // No maker assigned ⇒ no market: don't default a rate or force longs.
      if (!game.makerPlayer) continue;

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
          leagueId: game.leagueId,
          actor: "system",
          action: "maker_defaulted",
          gameId: game._id,
          after: { bid: DEFAULT_BID, offer: offerFor(DEFAULT_BID) },
        });
      }

      if (now >= game.koUtc && game.bid !== undefined) {
        const offer = offerFor(game.bid);
        const stake = (await getStakes(ctx, game.leagueId))[game.stage];
        const players = await ctx.db
          .query("players")
          .withIndex("by_league", (q) => q.eq("leagueId", game.leagueId!))
          .collect();
        const trades = await ctx.db
          .query("trades")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect();
        const traded = new Set(trades.map((t) => t.player));

        for (const p of players) {
          if (p.name === game.makerPlayer) continue;
          if (traded.has(p.name)) continue;
          await ctx.db.insert("trades", {
            leagueId: game.leagueId,
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
