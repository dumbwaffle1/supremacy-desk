import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { rebalanceMakers, requireLeagueAdmin } from "./leagues";
import { ADMIN_EMAIL } from "../src/config/constants";

/** The signed-in user (global identity). Per-league seat/role comes from
 *  leagues.get. null when signed out. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      userId,
      email: user.email ?? null,
      isAdmin:
        !!user.isAdmin ||
        (user.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    };
  },
});

/** Claim an unclaimed roster name in a league (one seat per user per league). */
export const claimPlayer = mutation({
  args: { leagueId: v.id("leagues"), playerId: v.id("players") },
  handler: async (ctx, { leagueId, playerId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    const already = await ctx.db
      .query("players")
      .withIndex("by_league_claimedBy", (q) =>
        q.eq("leagueId", leagueId).eq("claimedByUserId", userId),
      )
      .first();
    if (already) throw new Error(`You've already claimed "${already.name}".`);

    const player = await ctx.db.get(playerId);
    if (!player || player.leagueId !== leagueId)
      throw new Error("That name no longer exists.");
    if (player.claimedByUserId) throw new Error("That name is already taken.");

    await ctx.db.patch(playerId, { claimedByUserId: userId });
    await ensureMembership(ctx, leagueId, userId);
    return { name: player.name };
  },
});

/** "I'm not on the list" — add a new name to the league and claim it. */
export const addAndClaimPlayer = mutation({
  args: { leagueId: v.id("leagues"), name: v.string() },
  handler: async (ctx, { leagueId, name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");
    const trimmed = name.trim();
    if (trimmed.length < 1) throw new Error("Enter a name.");
    if (trimmed.length > 24) throw new Error("Keep the name under 24 characters.");

    const already = await ctx.db
      .query("players")
      .withIndex("by_league_claimedBy", (q) =>
        q.eq("leagueId", leagueId).eq("claimedByUserId", userId),
      )
      .first();
    if (already) throw new Error(`You've already claimed "${already.name}".`);

    const all = await ctx.db
      .query("players")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
    if (all.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("That name already exists — claim it instead.");
    }

    await ctx.db.insert("players", {
      leagueId,
      name: trimmed,
      claimedByUserId: userId,
      addedByUserId: userId,
    });
    await ensureMembership(ctx, leagueId, userId);
    await rebalanceMakers(ctx, leagueId); // new name → include in the rotation
    return { name: trimmed };
  },
});

async function ensureMembership(
  ctx: MutationCtx,
  leagueId: Id<"leagues">,
  userId: Id<"users">,
) {
  const m = await ctx.db
    .query("memberships")
    .withIndex("by_league_user", (q) =>
      q.eq("leagueId", leagueId).eq("userId", userId),
    )
    .first();
  if (!m) await ctx.db.insert("memberships", { leagueId, userId });
}

/** League owner: clear a claim (frees the name). Audited. */
export const adminClearClaim = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db.get(playerId);
    if (!player?.leagueId) throw new Error("No such player.");
    const { actor } = await requireLeagueAdmin(ctx, player.leagueId);
    if (player.claimedByUserId) {
      // leave membership; just free the seat
    }
    await ctx.db.patch(playerId, { claimedByUserId: undefined });
    await ctx.db.insert("auditLogs", {
      leagueId: player.leagueId,
      actor,
      action: "clear_claim",
      before: { player: player.name, claimedByUserId: player.claimedByUserId ?? null },
    });
    return { ok: true as const };
  },
});

/** League owner: rename a player. Audited. */
export const adminRenamePlayer = mutation({
  args: { playerId: v.id("players"), name: v.string() },
  handler: async (ctx, { playerId, name }) => {
    const player = await ctx.db.get(playerId);
    if (!player?.leagueId) throw new Error("No such player.");
    const { actor } = await requireLeagueAdmin(ctx, player.leagueId);
    const trimmed = name.trim();
    if (trimmed.length < 1) throw new Error("Enter a name.");
    await ctx.db.patch(playerId, { name: trimmed });
    await ctx.db.insert("auditLogs", {
      leagueId: player.leagueId,
      actor,
      action: "rename_player",
      before: { name: player.name },
      after: { name: trimmed },
    });
    return { ok: true as const };
  },
});
