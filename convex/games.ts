import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { offerFor, round2, teamSupremacy, tradePnl } from "./lib/game";
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

/* ── per-player to-do + live positions (the "To-do" tab) ──────────────── */

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

/**
 * What the viewer needs to do, and what they're exposed to, in one league —
 * additive + read-only, reusing the same identity/window logic as `detail`.
 *   todo:      MAKE_RATE (you're maker, no rate, teams known, KO < 3 days) and
 *              TRADE (rate exists, taker window open, you haven't traded).
 *   positions: POSITION (your live trade) and MAKER_BOOK (your book's longs/shorts).
 */
export const todo = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const now = Date.now();
    const stakes = await getStakes(ctx, leagueId);

    // Resolve the viewer's claimed seat in this league.
    const userId = await getAuthUserId(ctx);
    let player: string | null = null;
    if (userId) {
      const p = await ctx.db
        .query("players")
        .withIndex("by_league_claimedBy", (q) =>
          q.eq("leagueId", leagueId).eq("claimedByUserId", userId),
        )
        .first();
      player = p?.name ?? null;
    }
    if (player === null) {
      return { player: null, todo: [], positions: [] };
    }

    const games = await ctx.db
      .query("games")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();

    type Game = (typeof games)[number];
    const row = (g: Game) => ({
      gameId: g._id,
      stage: g.stage,
      home: g.home ?? null,
      away: g.away ?? null,
      koUtc: g.koUtc ?? null,
      status: g.status,
      makerPlayer: g.makerPlayer ?? null,
      quoteTeamName:
        (g.quoteTeam ?? "HOME") === "AWAY" ? (g.away ?? "Away") : (g.home ?? "Home"),
      bid: g.bid ?? null,
      offer: g.bid !== undefined ? offerFor(g.bid) : null,
      stake: stakes[g.stage],
      liveHome: g.liveHome ?? null,
      liveAway: g.liveAway ?? null,
    });
    type Row = ReturnType<typeof row>;

    // Running taker P&L on the quoted team, or null when the game isn't in play.
    const livePnlFor = (g: Game, side: "BUY" | "SELL", price: number, stake: number) => {
      if (g.status !== "LIVE" || g.liveHome == null || g.liveAway == null) return null;
      const sup = teamSupremacy(g.quoteTeam ?? "HOME", g.liveHome, g.liveAway);
      return tradePnl(side, price, sup, stake);
    };

    type TodoItem = Row & { kind: "MAKE_RATE" | "TRADE" };
    type PositionItem =
      | (Row & {
          kind: "POSITION";
          mySide: "BUY" | "SELL";
          myPrice: number;
          myStake: number;
          forcedLong: boolean;
          livePnl: number | null;
        })
      | (Row & {
          kind: "MAKER_BOOK";
          longs: number;
          shorts: number;
          netSupremacyExposure: number;
          livePnl: number | null;
        });
    const todo: TodoItem[] = [];
    const positions: PositionItem[] = [];

    for (const g of games) {
      const settledLike = g.status === "SETTLED" || g.status === "VOID";
      const stake = stakes[g.stage];

      if (g.makerPlayer === player) {
        // Maker: either a rate still to make, or a live book to watch.
        if (g.bid === undefined) {
          if (
            !settledLike &&
            g.home != null &&
            g.away != null &&
            g.koUtc != null &&
            g.koUtc <= now + THREE_DAYS &&
            makerWindowOpen(now, g.koUtc)
          ) {
            todo.push({ ...row(g), kind: "MAKE_RATE" });
          }
        } else if (!settledLike) {
          const trades = await ctx.db
            .query("trades")
            .withIndex("by_game", (q) => q.eq("gameId", g._id))
            .collect();
          const longs = trades.filter((t) => t.side === "BUY").length;
          const shorts = trades.filter((t) => t.side === "SELL").length;
          // Maker's net £/supremacy: gains when takers are net short, loses when
          // net long. (More BUYs than SELLs ⇒ negative for the maker.)
          const netSupremacyExposure = round2((shorts - longs) * stake);
          const livePnl =
            g.status === "LIVE" && g.liveHome != null && g.liveAway != null
              ? round2(
                  -trades.reduce(
                    (s, t) => s + (livePnlFor(g, t.side, t.priceTaken, t.stake) ?? 0),
                    0,
                  ),
                )
              : null;
          positions.push({
            ...row(g),
            kind: "MAKER_BOOK",
            longs,
            shorts,
            netSupremacyExposure,
            livePnl,
          });
        }
        continue;
      }

      // Non-maker: do I already hold a position here?
      const myTrade = await ctx.db
        .query("trades")
        .withIndex("by_game_player", (q) =>
          q.eq("gameId", g._id).eq("player", player),
        )
        .first();

      if (myTrade && !settledLike) {
        positions.push({
          ...row(g),
          kind: "POSITION",
          mySide: myTrade.side,
          myPrice: myTrade.priceTaken,
          myStake: myTrade.stake,
          forcedLong: myTrade.forcedLong ?? false,
          livePnl: livePnlFor(g, myTrade.side, myTrade.priceTaken, myTrade.stake),
        });
      } else if (!myTrade && g.bid !== undefined && takerWindowOpen(now, g.koUtc)) {
        todo.push({ ...row(g), kind: "TRADE" });
      }
    }

    const byKo = (a: Row, b: Row) => (a.koUtc ?? Infinity) - (b.koUtc ?? Infinity);
    todo.sort(byKo);
    positions.sort(
      (a, b) =>
        (a.status === "LIVE" ? 0 : 1) - (b.status === "LIVE" ? 0 : 1) || byKo(a, b),
    );

    return { player, todo, positions };
  },
});
