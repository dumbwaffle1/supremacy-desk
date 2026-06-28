import { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { STAKES, type Stage } from "../src/config/constants";

/** A league's effective stakes (its row, else the constant defaults). */
export async function getStakes(
  ctx: QueryCtx,
  leagueId: Id<"leagues"> | undefined,
): Promise<Record<Stage, number>> {
  const result: Record<Stage, number> = { ...STAKES };
  if (!leagueId) return result;
  const league = await ctx.db.get(leagueId);
  if (league?.stakes) {
    for (const s of league.stakes) result[s.stage as Stage] = s.amount;
  }
  return result;
}

export async function stakeOf(
  ctx: QueryCtx,
  leagueId: Id<"leagues"> | undefined,
  stage: Stage,
): Promise<number> {
  return (await getStakes(ctx, leagueId))[stage];
}
