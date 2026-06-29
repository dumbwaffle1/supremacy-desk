import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { ADMIN_EMAIL } from "../src/config/constants";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Super-admin usage dashboard: who's signed up, who's active, who's engaged.
 * Returns null for non-super-admins (the UI shows "not authorized").
 */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const caller = await ctx.db.get(userId);
    const isSuper =
      !!caller?.isAdmin ||
      (caller?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (!isSuper) return null;

    const now = Date.now();
    const [users, leagues, players, memberships, games, trades, feed, pushSubs] =
      await Promise.all([
        ctx.db.query("users").collect(),
        ctx.db.query("leagues").collect(),
        ctx.db.query("players").collect(),
        ctx.db.query("memberships").collect(),
        ctx.db.query("games").collect(),
        ctx.db.query("trades").collect(),
        ctx.db.query("feed").collect(),
        ctx.db.query("pushSubs").collect(),
      ]);

    const leagueName = new Map(leagues.map((l) => [l._id, l.name]));
    const feedAt = (f: (typeof feed)[number]) => f.at ?? f._creationTime;

    // userId → claimed seats [{leagueId, name}]
    const seatsByUser = new Map<string, { leagueId: Id<"leagues">; name: string }[]>();
    for (const p of players) {
      if (p.leagueId && p.claimedByUserId) {
        const k = p.claimedByUserId;
        const arr = seatsByUser.get(k) ?? [];
        arr.push({ leagueId: p.leagueId, name: p.name });
        seatsByUser.set(k, arr);
      }
    }
    // "leagueId|player" → trade count
    const tradeKey = (lid: Id<"leagues">, name: string) => `${lid}|${name}`;
    const tradesByLeaguePlayer = new Map<string, number>();
    for (const t of trades) {
      if (!t.leagueId) continue;
      const k = tradeKey(t.leagueId, t.player);
      tradesByLeaguePlayer.set(k, (tradesByLeaguePlayer.get(k) ?? 0) + 1);
    }
    const chatsByUser = new Map<string, number>();
    for (const f of feed) {
      if (f.kind === "chat" && f.authorUserId) {
        chatsByUser.set(f.authorUserId, (chatsByUser.get(f.authorUserId) ?? 0) + 1);
      }
    }
    const pushUsers = new Set(pushSubs.map((s) => s.userId as string));
    const leaguesByUser = new Map<string, Set<string>>();
    for (const m of memberships) {
      const set = leaguesByUser.get(m.userId) ?? new Set<string>();
      set.add(m.leagueId);
      leaguesByUser.set(m.userId, set);
    }

    const friends = users
      .map((u) => {
        const seats = seatsByUser.get(u._id) ?? [];
        const tradeCount = seats.reduce(
          (s, seat) => s + (tradesByLeaguePlayer.get(tradeKey(seat.leagueId, seat.name)) ?? 0),
          0,
        );
        return {
          userId: u._id,
          // Prefer their claimed seat name; displayName is just the email here.
          name: seats[0]?.name ?? (u.email ? u.email.split("@")[0] : "—"),
          email: u.email ?? null,
          signedUpAt: u._creationTime,
          lastActiveAt: u.lastActiveAt ?? null,
          leagues: (leaguesByUser.get(u._id) ?? new Set()).size,
          seats: seats.map((s) => ({ league: leagueName.get(s.leagueId) ?? "—", name: s.name })),
          trades: tradeCount,
          chats: chatsByUser.get(u._id) ?? 0,
          pushOn: pushUsers.has(u._id),
        };
      })
      .sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));

    const leagueRows = leagues
      .map((l) => {
        const ps = players.filter((p) => p.leagueId === l._id);
        const ts = trades.filter((t) => t.leagueId === l._id);
        const fs = feed.filter((f) => f.leagueId === l._id);
        const lastTrade = ts.reduce((m, t) => Math.max(m, t.submittedAt), 0);
        const lastFeed = fs.reduce((m, f) => Math.max(m, feedAt(f)), 0);
        return {
          leagueId: l._id,
          name: l.name,
          members: memberships.filter((m) => m.leagueId === l._id).length,
          seatsClaimed: ps.filter((p) => p.claimedByUserId).length,
          seatsTotal: ps.length,
          games: games.filter((g) => g.leagueId === l._id).length,
          trades: ts.length,
          lastActivityAt: Math.max(lastTrade, lastFeed) || null,
        };
      })
      .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));

    // Engagement gaps
    const unclaimedSeats = players
      .filter((p) => p.leagueId && !p.claimedByUserId)
      .map((p) => ({ league: leagueName.get(p.leagueId!) ?? "—", name: p.name }));
    const claimedNoTrades = friends
      .filter((f) => f.seats.length > 0 && f.trades === 0)
      .map((f) => ({ name: f.name, email: f.email }));

    const recent = [...feed]
      .sort((a, b) => feedAt(b) - feedAt(a))
      .slice(0, 25)
      .map((f) => ({
        _id: f._id,
        at: feedAt(f),
        league: leagueName.get(f.leagueId) ?? "—",
        kind: f.kind,
        actor: f.actor ?? "—",
        team: f.team ?? null,
        side: f.side ?? null,
        price: f.price ?? null,
        bid: f.bid ?? null,
        offer: f.offer ?? null,
        text: f.text ?? null,
      }));

    return {
      totals: {
        users: users.length,
        leagues: leagues.length,
        trades: trades.length,
        pushOn: pushUsers.size,
        activeToday: users.filter((u) => (u.lastActiveAt ?? 0) > now - DAY).length,
      },
      friends,
      leagues: leagueRows,
      unclaimedSeats,
      claimedNoTrades,
      recent,
    };
  },
});
