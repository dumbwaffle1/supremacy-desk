import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ADMIN_EMAIL } from "../src/config/constants";

function isAdminEmail(email: string | undefined | null): boolean {
  return (email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/** The Player this user has claimed (authoritative, from the players table). */
async function claimedPlayerOf(ctx: QueryCtx, userId: import("./_generated/dataModel").Id<"users">) {
  return await ctx.db
    .query("players")
    .withIndex("by_claimedBy", (q) => q.eq("claimedByUserId", userId))
    .first();
}

/** Throws unless the caller is an authenticated admin. Returns the user. */
async function requireAdmin(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not signed in.");
  const user = await ctx.db.get(userId);
  if (!user || !(user.isAdmin || isAdminEmail(user.email))) {
    throw new Error("Admins only.");
  }
  return { userId, user };
}

/** Current signed-in user + their claimed seat. null when signed out. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const claimed = await claimedPlayerOf(ctx, userId);
    return {
      userId,
      email: user.email ?? null,
      isAdmin: !!user.isAdmin || isAdminEmail(user.email),
      playerName: claimed?.name ?? null,
      playerId: claimed?._id ?? null,
    };
  },
});

/** Claim an existing UNCLAIMED roster name. One seat per account; one account per name. */
export const claimPlayer = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");

    const already = await claimedPlayerOf(ctx, userId);
    if (already) throw new Error(`You've already claimed "${already.name}".`);

    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("That name no longer exists.");
    if (player.claimedByUserId) throw new Error("That name is already taken.");

    await ctx.db.patch(playerId, { claimedByUserId: userId });
    await ctx.db.patch(userId, { playerName: player.name });
    return { name: player.name };
  },
});

/** "I'm not on the list" — add a new name and claim it (open roster). */
export const addAndClaimPlayer = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");

    const trimmed = name.trim();
    if (trimmed.length < 1) throw new Error("Enter a name.");
    if (trimmed.length > 24) throw new Error("Keep the name under 24 characters.");

    const already = await claimedPlayerOf(ctx, userId);
    if (already) throw new Error(`You've already claimed "${already.name}".`);

    const all = await ctx.db.query("players").collect();
    if (all.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("That name already exists — claim it instead.");
    }

    const playerId = await ctx.db.insert("players", {
      name: trimmed,
      claimedByUserId: userId,
      addedByUserId: userId,
    });
    await ctx.db.patch(userId, { playerName: trimmed });
    return { name: trimmed, playerId };
  },
});

/** Admin: clear a claim (frees the name to be re-claimed). Audited. */
export const adminClearClaim = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const { user } = await requireAdmin(ctx);
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("No such player.");

    if (player.claimedByUserId) {
      await ctx.db.patch(player.claimedByUserId, { playerName: undefined });
    }
    await ctx.db.patch(playerId, { claimedByUserId: undefined });
    await ctx.db.insert("auditLogs", {
      actor: user.email ?? "admin",
      action: "clear_claim",
      before: { player: player.name, claimedByUserId: player.claimedByUserId ?? null },
      after: { claimedByUserId: null },
    });
    return { ok: true as const };
  },
});

/** Admin: rename a player (keeps the claim). Audited. */
export const adminRenamePlayer = mutation({
  args: { playerId: v.id("players"), name: v.string() },
  handler: async (ctx, { playerId, name }) => {
    const { user } = await requireAdmin(ctx);
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("No such player.");

    const trimmed = name.trim();
    if (trimmed.length < 1) throw new Error("Enter a name.");

    await ctx.db.patch(playerId, { name: trimmed });
    if (player.claimedByUserId) {
      await ctx.db.patch(player.claimedByUserId, { playerName: trimmed });
    }
    await ctx.db.insert("auditLogs", {
      actor: user.email ?? "admin",
      action: "rename_player",
      before: { name: player.name },
      after: { name: trimmed },
    });
    return { ok: true as const };
  },
});
