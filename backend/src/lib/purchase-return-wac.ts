import { Prisma } from "@prisma/client";

/**
 * Weighted-average cost per unit from received purchase lines — the SAME methodology
 * the Business Position / inventory valuation uses:
 *
 *   WAC = Σ(quantity_received × unit_cost_exclusive) / Σ(quantity_received)
 *
 * Returns `null` when there is no received purchase history (mirrors `COALESCE(wac, 0)`
 * in capital.service — callers treat null as 0). Purchase RETURNS never appear here:
 * they don't create purchase lines, so they can't move WAC. This keeps returns from
 * ever rewriting historical purchase quantities or the valuation basis.
 */
export type ReceivedPurchaseLine = {
  quantityReceived: number | Prisma.Decimal;
  unitCostExclusive: number | Prisma.Decimal;
};

export function weightedAverageCost(lines: ReceivedPurchaseLine[]): Prisma.Decimal | null {
  let qtySum = new Prisma.Decimal(0);
  let costSum = new Prisma.Decimal(0);
  for (const l of lines) {
    const q = new Prisma.Decimal(l.quantityReceived);
    if (q.lte(0)) continue;
    qtySum = qtySum.plus(q);
    costSum = costSum.plus(q.mul(new Prisma.Decimal(l.unitCostExclusive)));
  }
  if (qtySum.lte(0)) return null;
  return costSum.div(qtySum);
}
