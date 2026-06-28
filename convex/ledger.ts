import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { pnlMap } from "./standings";
import { roundedBalances, minimalTransfers } from "./lib/ledger";
import { requireLeagueAdmin } from "./leagues";
import { STAGES } from "../src/config/constants";

export const ledger = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const { cum, settledCount } = await pnlMap(ctx, leagueId);
    const balances = roundedBalances(cum).sort(
      (a, b) => b.net - a.net || a.player.localeCompare(b.player),
    );
    const transfers = minimalTransfers(balances);

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
    const paidPairs = new Set(payments.map((p) => `${p.fromPlayer}->${p.toPlayer}`));
    const transfersAnnotated = transfers.map((t) => ({
      ...t,
      paid: paidPairs.has(`${t.from}->${t.to}`),
    }));

    const stageBreakdown = [];
    for (const stage of STAGES) {
      const { cum: sc, settledCount: n } = await pnlMap(ctx, leagueId, stage);
      if (n > 0) {
        stageBreakdown.push({
          stage,
          rows: roundedBalances(sc)
            .filter((b) => b.net !== 0)
            .sort((a, b) => b.net - a.net),
        });
      }
    }

    const snap = await ctx.db
      .query("ledgerSnapshots")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .order("desc")
      .first();

    return {
      balances,
      transfers: transfersAnnotated,
      settledCount,
      zeroSum: balances.reduce((s, b) => s + b.net, 0) === 0,
      stageBreakdown,
      snapshot: snap
        ? { by: snap.by, at: snap._creationTime, balances: snap.balances, transfers: snap.transfers }
        : null,
    };
  },
});

export const recordPayment = mutation({
  args: { leagueId: v.id("leagues"), from: v.string(), to: v.string(), amount: v.number() },
  handler: async (ctx, { leagueId, from, to, amount }) => {
    const { actor } = await requireLeagueAdmin(ctx, leagueId);
    await ctx.db.insert("payments", {
      leagueId,
      fromPlayer: from,
      toPlayer: to,
      amount,
      ts: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      leagueId,
      actor,
      action: "payment_recorded",
      after: { from, to, amount },
    });
    return { ok: true as const };
  },
});

export const clearPayment = mutation({
  args: { leagueId: v.id("leagues"), from: v.string(), to: v.string() },
  handler: async (ctx, { leagueId, from, to }) => {
    const { actor } = await requireLeagueAdmin(ctx, leagueId);
    const rows = (
      await ctx.db
        .query("payments")
        .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
        .collect()
    ).filter((p) => p.fromPlayer === from && p.toPlayer === to);
    await Promise.all(rows.map((r) => ctx.db.delete(r._id)));
    await ctx.db.insert("auditLogs", {
      leagueId,
      actor,
      action: "payment_cleared",
      after: { from, to },
    });
    return { ok: true as const };
  },
});

export const finalSettle = mutation({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const { actor } = await requireLeagueAdmin(ctx, leagueId);
    const { cum } = await pnlMap(ctx, leagueId);
    const balances = roundedBalances(cum).sort((a, b) => b.net - a.net);
    const transfers = minimalTransfers(balances);
    await ctx.db.insert("ledgerSnapshots", { leagueId, by: actor, balances, transfers });
    await ctx.db.insert("auditLogs", {
      leagueId,
      actor,
      action: "final_settle",
      after: { balances, transfers },
    });
    return { ok: true as const };
  },
});
