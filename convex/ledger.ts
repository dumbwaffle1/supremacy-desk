import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { pnlMap } from "./standings";
import { roundedBalances, minimalTransfers } from "./lib/ledger";
import { requireAdmin } from "./admin";
import { STAGES } from "../src/config/constants";

/**
 * The live Splitwise ledger: whole-£ net balances, the fewest transfers to
 * clear them, a per-stage breakdown, recorded real-world payments, and the
 * official snapshot if a final settle has been run. DERIVED + realtime.
 */
export const ledger = query({
  args: {},
  handler: async (ctx) => {
    const { cum, settledCount } = await pnlMap(ctx);
    const balances = roundedBalances(cum).sort(
      (a, b) => b.net - a.net || a.player.localeCompare(b.player),
    );
    const transfers = minimalTransfers(balances);

    const payments = await ctx.db.query("payments").collect();
    const paidPairs = new Set(payments.map((p) => `${p.fromPlayer}->${p.toPlayer}`));
    const transfersAnnotated = transfers.map((t) => ({
      ...t,
      paid: paidPairs.has(`${t.from}->${t.to}`),
    }));

    const stageBreakdown = [];
    for (const stage of STAGES) {
      const { cum: sc, settledCount: n } = await pnlMap(ctx, stage);
      if (n > 0) {
        stageBreakdown.push({
          stage,
          rows: roundedBalances(sc)
            .filter((b) => b.net !== 0)
            .sort((a, b) => b.net - a.net),
        });
      }
    }

    const snap = await ctx.db.query("ledgerSnapshots").order("desc").first();

    return {
      balances,
      transfers: transfersAnnotated,
      settledCount,
      zeroSum: balances.reduce((s, b) => s + b.net, 0) === 0,
      stageBreakdown,
      payments: payments
        .sort((a, b) => b.ts - a.ts)
        .map((p) => ({
          from: p.fromPlayer,
          to: p.toPlayer,
          amount: p.amount,
          ts: p.ts,
        })),
      snapshot: snap
        ? { by: snap.by, at: snap._creationTime, balances: snap.balances, transfers: snap.transfers }
        : null,
    };
  },
});

/** Admin: record a real-world payment (marks a transfer paid). Audited. */
export const recordPayment = mutation({
  args: { from: v.string(), to: v.string(), amount: v.number() },
  handler: async (ctx, { from, to, amount }) => {
    const { actor } = await requireAdmin(ctx);
    await ctx.db.insert("payments", {
      fromPlayer: from,
      toPlayer: to,
      amount,
      ts: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      actor,
      action: "payment_recorded",
      after: { from, to, amount },
    });
    return { ok: true as const };
  },
});

/** Admin: un-mark a recorded payment for a pair. Audited. */
export const clearPayment = mutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const { actor } = await requireAdmin(ctx);
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_pair", (q) => q.eq("fromPlayer", from).eq("toPlayer", to))
      .collect();
    await Promise.all(rows.map((r) => ctx.db.delete(r._id)));
    await ctx.db.insert("auditLogs", {
      actor,
      action: "payment_cleared",
      after: { from, to },
    });
    return { ok: true as const };
  },
});

/** Admin: snapshot the current ledger as the official end-of-tournament result. */
export const finalSettle = mutation({
  args: {},
  handler: async (ctx) => {
    const { actor } = await requireAdmin(ctx);
    const { cum } = await pnlMap(ctx);
    const balances = roundedBalances(cum).sort((a, b) => b.net - a.net);
    const transfers = minimalTransfers(balances);
    await ctx.db.insert("ledgerSnapshots", { by: actor, balances, transfers });
    await ctx.db.insert("auditLogs", {
      actor,
      action: "final_settle",
      after: { balances, transfers },
    });
    return { ok: true as const };
  },
});
