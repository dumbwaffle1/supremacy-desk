import { internalMutation, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { makeInviteCode } from "./lib/invite";
import {
  ADMIN_EMAIL,
  SETTLEMENT_BASIS,
  STAGES,
  STAKES,
  WIDTH,
} from "../src/config/constants";

async function backfill(ctx: MutationCtx, leagueId: Id<"leagues">) {
  let n = 0;
  for (const r of await ctx.db.query("players").collect())
    if (r.leagueId === undefined) (await ctx.db.patch(r._id, { leagueId }), n++);
  for (const r of await ctx.db.query("games").collect())
    if (r.leagueId === undefined) (await ctx.db.patch(r._id, { leagueId }), n++);
  for (const r of await ctx.db.query("trades").collect())
    if (r.leagueId === undefined) (await ctx.db.patch(r._id, { leagueId }), n++);
  for (const r of await ctx.db.query("auditLogs").collect())
    if (r.leagueId === undefined) (await ctx.db.patch(r._id, { leagueId }), n++);
  for (const r of await ctx.db.query("payments").collect())
    if (r.leagueId === undefined) (await ctx.db.patch(r._id, { leagueId }), n++);
  for (const r of await ctx.db.query("ledgerSnapshots").collect())
    if (r.leagueId === undefined) (await ctx.db.patch(r._id, { leagueId }), n++);
  return n;
}

/**
 * One-time: wrap all pre-multi-tenant data into a default league owned by the
 * admin, and backfill leagueId everywhere. Idempotent.
 */
export const toLeagues = internalMutation({
  args: {},
  handler: async (ctx) => {
    let league = await ctx.db.query("leagues").first();
    if (!league) {
      const tour = await ctx.db.query("tournaments").first();
      const admin = (await ctx.db.query("users").collect()).find(
        (u) =>
          u.isAdmin || (u.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase(),
      );
      const stakes =
        tour?.stakes ?? STAGES.map((stage) => ({ stage, amount: STAKES[stage] }));
      const leagueId = await ctx.db.insert("leagues", {
        name: tour?.name ?? "WC2026 Knockouts",
        tournament: "WC2026",
        width: tour?.width ?? WIDTH,
        stakes,
        settlementBasis: tour?.settlementBasis ?? SETTLEMENT_BASIS,
        ownerUserId: admin?._id,
        inviteCode: makeInviteCode(),
      });
      league = (await ctx.db.get(leagueId))!;
    }

    const backfilled = await backfill(ctx, league._id);
    return {
      leagueId: league._id,
      inviteCode: league.inviteCode,
      owner: league.ownerUserId ?? null,
      backfilled,
    };
  },
});
