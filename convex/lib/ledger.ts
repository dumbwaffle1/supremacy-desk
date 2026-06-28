// Pure ledger math: net balances → fewest "who pays whom" transfers.

export type Balance = { player: string; net: number };
export type Transfer = { from: string; to: string; amount: number };

/**
 * Round each player's P&L to whole £. The game is zero-sum, but rounding can
 * leave a small residual — absorb it into the largest balance so the rounded
 * balances still sum to exactly 0 (spec §8).
 */
export function roundedBalances(pnl: Map<string, number>): Balance[] {
  const rounded = [...pnl.entries()].map(([player, v]) => ({
    player,
    net: Math.round(v),
  }));
  const residual = rounded.reduce((s, b) => s + b.net, 0);
  if (residual !== 0 && rounded.length > 0) {
    let mi = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (Math.abs(rounded[i].net) > Math.abs(rounded[mi].net)) mi = i;
    }
    rounded[mi].net -= residual;
  }
  return rounded;
}

/**
 * Greedy minimal transfers: repeatedly match the largest creditor with the
 * largest debtor, transfer min(|debtor|, creditor), until all clear (spec §8).
 * Produces at most n−1 transfers.
 */
export function minimalTransfers(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net - a.net);
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ player: b.player, net: -b.net }))
    .sort((a, b) => b.net - a.net);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.net, d.net);
    if (amount > 0) transfers.push({ from: d.player, to: c.player, amount });
    c.net -= amount;
    d.net -= amount;
    if (c.net === 0) ci++;
    if (d.net === 0) di++;
  }
  return transfers;
}
