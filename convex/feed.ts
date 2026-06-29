import { v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { ADMIN_EMAIL } from "../src/config/constants";
import { offerFor } from "./lib/game";

/** A feed row to insert. Auto-posted (rate/trade) or user chat. */
export type FeedEntry = {
  leagueId: Id<"leagues">;
  kind: "rate" | "trade" | "chat";
  actor?: string;
  authorUserId?: Id<"users">;
  gameId?: Id<"games">;
  matchup?: string;
  team?: string;
  bid?: number;
  offer?: number;
  side?: "BUY" | "SELL";
  price?: number;
  text?: string;
  at?: number;
};

/** Insert a feed entry. Called inline from trade/rate mutations and chat posts. */
export async function postFeed(ctx: MutationCtx, entry: FeedEntry): Promise<void> {
  await ctx.db.insert("feed", entry);
}

/** Is this user allowed to read/post in this league? (member, owner, or super-admin) */
async function canParticipate(
  ctx: MutationCtx,
  leagueId: Id<"leagues">,
  userId: Id<"users">,
): Promise<{ ok: boolean; display: string }> {
  const user = await ctx.db.get(userId);
  const league = await ctx.db.get(leagueId);
  const claimed = await ctx.db
    .query("players")
    .withIndex("by_league_claimedBy", (q) =>
      q.eq("leagueId", leagueId).eq("claimedByUserId", userId),
    )
    .first();
  const isSuper =
    !!user?.isAdmin || (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const member = await ctx.db
    .query("memberships")
    .withIndex("by_league_user", (q) =>
      q.eq("leagueId", leagueId).eq("userId", userId),
    )
    .first();
  const ok = !!claimed || league?.ownerUserId === userId || isSuper || !!member;
  const display =
    claimed?.name ??
    user?.displayName ??
    (user?.email ? user.email.split("@")[0] : "Someone");
  return { ok, display };
}

/** Recent feed entries for a league, oldest-first (chat-style: newest at bottom). */
export const list = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const rows = await ctx.db
      .query("feed")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .order("desc")
      .take(100);
    return rows.reverse().map((r) => ({
      _id: r._id,
      at: r.at ?? r._creationTime,
      kind: r.kind,
      actor: r.actor ?? null,
      gameId: r.gameId ?? null,
      matchup: r.matchup ?? null,
      team: r.team ?? null,
      bid: r.bid ?? null,
      offer: r.offer ?? null,
      side: r.side ?? null,
      price: r.price ?? null,
      text: r.text ?? null,
    }));
  },
});

/** Post a chat message to a league's feed. */
export const post = mutation({
  args: { leagueId: v.id("leagues"), text: v.string() },
  handler: async (ctx, { leagueId, text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to chat.");
    const trimmed = text.trim();
    if (!trimmed) return { ok: false as const };
    if (trimmed.length > 500) throw new Error("Message too long (500 max).");
    const { ok, display } = await canParticipate(ctx, leagueId, userId);
    if (!ok) throw new Error("Join this league to chat.");
    await postFeed(ctx, {
      leagueId,
      kind: "chat",
      actor: display,
      authorUserId: userId,
      text: trimmed,
    });
    return { ok: true as const };
  },
});

/** Mark the league's feed as seen up to now (clears the unread badge). */
export const markSeen = mutation({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const existing = await ctx.db
      .query("feedReads")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", leagueId).eq("userId", userId),
      )
      .first();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { lastSeen: now });
    else await ctx.db.insert("feedReads", { leagueId, userId, lastSeen: now });
  },
});

/** Number of feed entries since the viewer last looked, excluding their own. */
export const unreadCount = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const read = await ctx.db
      .query("feedReads")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", leagueId).eq("userId", userId),
      )
      .first();
    const lastSeen = read?.lastSeen ?? 0;
    const rows = await ctx.db
      .query("feed")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .order("desc")
      .take(100);
    return rows.filter(
      (r) => r._creationTime > lastSeen && r.authorUserId !== userId,
    ).length;
  },
});

/**
 * One-off: rebuild the rate/trade feed from existing games + trades, in
 * chronological order (so _creationTime preserves order), stamping each with its
 * original `at`. Idempotent — wipes prior auto entries first, keeps chat. Marks
 * everyone's feed as seen so the backfill doesn't show as a giant unread badge.
 * Run with: npx convex run feed:backfill
 */
export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clear existing auto entries (keep chat) so a re-run doesn't duplicate.
    const all = await ctx.db.query("feed").collect();
    for (const f of all) {
      if (f.kind === "rate" || f.kind === "trade") await ctx.db.delete(f._id);
    }

    const games = await ctx.db.query("games").collect();
    const gameById = new Map(games.map((g) => [g._id, g]));
    const players = await ctx.db.query("players").collect();
    const userIdFor = (leagueId: Id<"leagues">, name: string) =>
      players.find((p) => p.leagueId === leagueId && p.name === name)?.claimedByUserId;
    const teamOf = (g: (typeof games)[number]) =>
      (g.quoteTeam ?? "HOME") === "AWAY" ? (g.away ?? "Away") : (g.home ?? "Home");
    const matchOf = (g: (typeof games)[number]) =>
      `${g.home ?? "?"} v ${g.away ?? "?"}`;

    const events: FeedEntry[] = [];
    for (const g of games) {
      if (!g.leagueId || g.bid === undefined || !g.makerPlayer) continue;
      events.push({
        leagueId: g.leagueId,
        kind: "rate",
        actor: g.makerPlayer,
        authorUserId: userIdFor(g.leagueId, g.makerPlayer),
        gameId: g._id,
        matchup: matchOf(g),
        team: teamOf(g),
        bid: g.bid,
        offer: offerFor(g.bid),
        at: g.makerSubmittedAt ?? g._creationTime,
      });
    }
    const trades = await ctx.db.query("trades").collect();
    for (const t of trades) {
      const g = gameById.get(t.gameId);
      if (!g || !g.leagueId) continue;
      events.push({
        leagueId: g.leagueId,
        kind: "trade",
        actor: t.player,
        authorUserId: userIdFor(g.leagueId, t.player),
        gameId: g._id,
        matchup: matchOf(g),
        team: teamOf(g),
        side: t.side,
        price: t.priceTaken,
        at: t.submittedAt,
      });
    }

    events.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    for (const e of events) await ctx.db.insert("feed", e);

    // Mark everyone's feed as seen so history isn't a surprise unread badge.
    const now = Date.now();
    const seen = new Set<string>();
    const upsertSeen = async (leagueId: Id<"leagues">, userId: Id<"users">) => {
      const key = `${leagueId}:${userId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const existing = await ctx.db
        .query("feedReads")
        .withIndex("by_league_user", (q) =>
          q.eq("leagueId", leagueId).eq("userId", userId),
        )
        .first();
      if (existing) await ctx.db.patch(existing._id, { lastSeen: now });
      else await ctx.db.insert("feedReads", { leagueId, userId, lastSeen: now });
    };
    const memberships = await ctx.db.query("memberships").collect();
    for (const m of memberships) await upsertSeen(m.leagueId, m.userId);
    for (const p of players) {
      if (p.leagueId && p.claimedByUserId) await upsertSeen(p.leagueId, p.claimedByUserId);
    }

    return { inserted: events.length };
  },
});
