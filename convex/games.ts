import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { offerFor, round2 } from "./lib/game";
import { getStakes } from "./tournament";
import { makerWindowOpen, takerWindowOpen } from "./lib/trading";
import { ADMIN_EMAIL } from "../src/config/constants";

/** A league's games with derived offer + stake, ordered by gameNo. */
export const list = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const games = await ctx.db
      .query("games")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
    const stakes = await getStakes(ctx, leagueId);
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
        quoteTeam: g.quoteTeam ?? "HOME",
        quoteTeamName:
          (g.quoteTeam ?? "HOME") === "AWAY" ? (g.away ?? "Away") : (g.home ?? "Home"),
        bid: g.bid ?? null,
        offer: g.bid !== undefined ? offerFor(g.bid) : null,
        stake: stakes[g.stage],
        defaultedMaker: g.defaultedMaker ?? false,
        settleHome: g.settleHome ?? null,
        settleAway: g.settleAway ?? null,
        liveHome: g.liveHome ?? null,
        liveAway: g.liveAway ?? null,
      }));
  },
});

/** One game with book, window state, still-to-trade, and the viewer's role. */
export const detail = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.leagueId) return null;
    const leagueId = game.leagueId;

    const now = Date.now();
    const offer = game.bid !== undefined ? offerFor(game.bid) : null;
    const stake = (await getStakes(ctx, leagueId))[game.stage];

    const trades = await ctx.db
      .query("trades")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const players = await ctx.db
      .query("players")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
    const traded = new Set(trades.map((t) => t.player));
    const stillToTrade = players
      .filter((p) => p.name !== game.makerPlayer && !traded.has(p.name))
      .map((p) => p.name);

    const userId = await getAuthUserId(ctx);
    let mePlayer: string | null = null;
    let isAdmin = false;
    if (userId) {
      const user = await ctx.db.get(userId);
      const league = await ctx.db.get(leagueId);
      isAdmin =
        league?.ownerUserId === userId ||
        !!user?.isAdmin ||
        (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
      mePlayer =
        players.find((p) => p.claimedByUserId === userId)?.name ?? null;
    }
    const myTrade = mePlayer
      ? (trades.find((t) => t.player === mePlayer) ?? null)
      : null;

    return {
      _id: game._id,
      leagueId,
      gameNo: game.gameNo,
      stage: game.stage,
      round: game.round ?? null,
      home: game.home ?? null,
      away: game.away ?? null,
      koUtc: game.koUtc ?? null,
      status: game.status,
      makerPlayer: game.makerPlayer ?? null,
      quoteTeam: game.quoteTeam ?? "HOME",
      quoteTeamName:
        (game.quoteTeam ?? "HOME") === "AWAY"
          ? (game.away ?? "Away")
          : (game.home ?? "Home"),
      bid: game.bid ?? null,
      offer,
      stake,
      defaultedMaker: game.defaultedMaker ?? false,
      makerPnl:
        game.status === "SETTLED" && game.makerPlayer
          ? round2(-trades.reduce((s, t) => s + (t.pnl ?? 0), 0))
          : null,
      settleHome: game.settleHome ?? null,
      settleAway: game.settleAway ?? null,
      liveHome: game.liveHome ?? null,
      liveAway: game.liveAway ?? null,
      makerOpen: makerWindowOpen(now, game.koUtc),
      takerOpen: takerWindowOpen(now, game.koUtc),
      hasTrades: trades.length > 0,
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
        isAdmin,
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
