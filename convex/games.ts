import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { offerFor, stakeForStage } from "./lib/game";
import { makerWindowOpen, takerWindowOpen } from "./lib/trading";

/** All games with derived offer + stake, ordered by gameNo. Read by the UI —
 *  screen loads never hit the football API (everything is cached in Convex). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    return games
      .sort((a, b) => a.gameNo - b.gameNo)
      .map((g) => ({
        _id: g._id,
        fixtureId: g.fixtureId ?? null,
        gameNo: g.gameNo,
        stage: g.stage,
        round: g.round ?? null,
        home: g.home ?? null,
        away: g.away ?? null,
        koUtc: g.koUtc ?? null,
        status: g.status,
        makerPlayer: g.makerPlayer ?? null,
        bid: g.bid ?? null,
        offer: g.bid !== undefined ? offerFor(g.bid) : null,
        stake: stakeForStage(g.stage),
        defaultedMaker: g.defaultedMaker ?? false,
        settleHome: g.settleHome ?? null,
        settleAway: g.settleAway ?? null,
        liveHome: g.liveHome ?? null,
        liveAway: g.liveAway ?? null,
      }));
  },
});

/** One game with its book, window state, still-to-trade list, and the viewer's
 *  own role/position. Drives the Games detail screen (Prompt 6). */
export const detail = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;

    const now = Date.now();
    const offer = game.bid !== undefined ? offerFor(game.bid) : null;
    const stake = stakeForStage(game.stage);

    const trades = await ctx.db
      .query("trades")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const players = await ctx.db.query("players").collect();
    const traded = new Set(trades.map((t) => t.player));
    const stillToTrade = players
      .filter((p) => p.name !== game.makerPlayer && !traded.has(p.name))
      .map((p) => p.name);

    // Viewer
    const userId = await getAuthUserId(ctx);
    let mePlayer: string | null = null;
    if (userId) {
      const p = await ctx.db
        .query("players")
        .withIndex("by_claimedBy", (q) => q.eq("claimedByUserId", userId))
        .first();
      mePlayer = p?.name ?? null;
    }
    const myTrade = mePlayer
      ? (trades.find((t) => t.player === mePlayer) ?? null)
      : null;

    return {
      _id: game._id,
      gameNo: game.gameNo,
      stage: game.stage,
      round: game.round ?? null,
      home: game.home ?? null,
      away: game.away ?? null,
      koUtc: game.koUtc ?? null,
      status: game.status,
      makerPlayer: game.makerPlayer ?? null,
      bid: game.bid ?? null,
      offer,
      stake,
      defaultedMaker: game.defaultedMaker ?? false,
      settleHome: game.settleHome ?? null,
      settleAway: game.settleAway ?? null,
      liveHome: game.liveHome ?? null,
      liveAway: game.liveAway ?? null,
      makerOpen: makerWindowOpen(now, game.koUtc),
      takerOpen: takerWindowOpen(now, game.koUtc),
      book: trades.map((t) => ({
        player: t.player,
        side: t.side,
        priceTaken: t.priceTaken,
        stake: t.stake,
        forcedLong: t.forcedLong ?? false,
        pnl: t.pnl ?? null,
      })),
      stillToTrade,
      me: {
        player: mePlayer,
        isMaker: mePlayer !== null && mePlayer === game.makerPlayer,
        trade: myTrade
          ? {
              side: myTrade.side,
              priceTaken: myTrade.priceTaken,
              stake: myTrade.stake,
              forcedLong: myTrade.forcedLong ?? false,
              pnl: myTrade.pnl ?? null,
            }
          : null,
      },
    };
  },
});
