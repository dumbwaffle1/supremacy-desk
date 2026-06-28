import { internalMutation, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const MIN = 60 * 1000;

/** Notify a user once for a (game, kind), respecting prefs + de-dup. */
async function notifyOnce(
  ctx: MutationCtx,
  userId: Id<"users">,
  game: Doc<"games">,
  kind: "maker" | "taker",
  title: string,
  body: string,
) {
  const pref = await ctx.db
    .query("notifPrefs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const enabled = pref ? (kind === "maker" ? pref.maker : pref.taker) : true;
  if (!enabled) return false;

  const sent = await ctx.db
    .query("notifsSent")
    .withIndex("by_key", (q) =>
      q.eq("userId", userId).eq("gameId", game._id).eq("kind", kind),
    )
    .first();
  if (sent) return false;

  // Mark sent regardless, so we don't re-evaluate every tick.
  await ctx.db.insert("notifsSent", { userId, gameId: game._id, kind });

  const sub = await ctx.db
    .query("pushSubs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!sub) return false;

  await ctx.scheduler.runAfter(0, internal.pushNode.send, {
    userId,
    title,
    body,
    url: `/l/${game.leagueId}/games/${game._id}`,
  });
  return true;
}

/** Every few minutes: maker "rate due" (90→60m pre-KO) and taker "trade closes"
 *  (30→0m pre-KO) reminders, per user, across all leagues. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const games = await ctx.db.query("games").collect();
    let scheduled = 0;

    for (const g of games) {
      if (!g.leagueId || g.koUtc === undefined) continue;
      if (g.status === "SETTLED" || g.status === "VOID") continue;
      const ko = g.koUtc;
      const makerWindow = now >= ko - 90 * MIN && now < ko - 60 * MIN;
      const takerWindow = now >= ko - 30 * MIN && now < ko;
      if (!makerWindow && !takerWindow) continue;

      const players = await ctx.db
        .query("players")
        .withIndex("by_league", (q) => q.eq("leagueId", g.leagueId!))
        .collect();
      const matchup = `${g.home ?? "TBD"} v ${g.away ?? "TBD"}`;

      if (makerWindow && g.bid === undefined && g.makerPlayer) {
        const maker = players.find(
          (p) => p.name === g.makerPlayer && p.claimedByUserId,
        );
        if (
          maker?.claimedByUserId &&
          (await notifyOnce(
            ctx,
            maker.claimedByUserId,
            g,
            "maker",
            "You're the maker — rate due",
            `${matchup}: submit your rate before kick-off.`,
          ))
        )
          scheduled++;
      }

      if (takerWindow && g.bid !== undefined) {
        const trades = await ctx.db
          .query("trades")
          .withIndex("by_game", (q) => q.eq("gameId", g._id))
          .collect();
        const traded = new Set(trades.map((t) => t.player));
        for (const p of players) {
          if (!p.claimedByUserId) continue;
          if (p.name === g.makerPlayer || traded.has(p.name)) continue;
          if (
            await notifyOnce(
              ctx,
              p.claimedByUserId,
              g,
              "taker",
              "Trade closes at kick-off",
              `${matchup}: place your trade before it locks.`,
            )
          )
            scheduled++;
        }
      }
    }
    return { scheduled };
  },
});
