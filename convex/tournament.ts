import { query, QueryCtx } from "./_generated/server";
import { STAKES, type Stage } from "../src/config/constants";

/** Effective stakes: the tournament row if present, else the constant defaults.
 *  Read at trade time so admin stake edits take effect for new trades. */
export async function getStakes(ctx: QueryCtx): Promise<Record<Stage, number>> {
  const tour = await ctx.db.query("tournaments").first();
  const result: Record<Stage, number> = { ...STAKES };
  if (tour?.stakes) {
    for (const s of tour.stakes) result[s.stage as Stage] = s.amount;
  }
  return result;
}

export async function stakeOf(ctx: QueryCtx, stage: Stage): Promise<number> {
  return (await getStakes(ctx))[stage];
}

/** The tournament config (name, width, stakes, settlement basis). */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const tour = await ctx.db.query("tournaments").first();
    if (!tour) return null;
    return {
      name: tour.name,
      width: tour.width,
      stakes: await getStakes(ctx),
      settlementBasis: tour.settlementBasis,
    };
  },
});
