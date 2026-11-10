import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ADMIN_EMAIL } from "../../src/config/constants";

/** A global super-admin: the isAdmin flag, or the ADMIN_EMAIL account. */
export function isSuperAdmin(user: Doc<"users"> | null): boolean {
  return (
    !!user?.isAdmin ||
    (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
}

/**
 * The signed-in user, if they may see this league's data: its owner, anyone
 * who joined with the invite link, anyone holding a seat in it, or a
 * super-admin (peek mode). null for everyone else, signed in or not, and for
 * a league that doesn't exist. Every query that returns a league's games,
 * trades, players, standings, ledger or feed checks this first, so knowing a
 * league's id (it's in every URL) is not enough to read it.
 */
export async function leagueViewer(
  ctx: QueryCtx,
  leagueId: Id<"leagues">,
): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const league = await ctx.db.get(leagueId);
  if (!league) return null;
  if (league.ownerUserId === userId) return userId;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_league_user", (q) =>
      q.eq("leagueId", leagueId).eq("userId", userId),
    )
    .first();
  if (membership) return userId;
  const seat = await ctx.db
    .query("players")
    .withIndex("by_league_claimedBy", (q) =>
      q.eq("leagueId", leagueId).eq("claimedByUserId", userId),
    )
    .first();
  if (seat) return userId;
  return isSuperAdmin(await ctx.db.get(userId)) ? userId : null;
}
