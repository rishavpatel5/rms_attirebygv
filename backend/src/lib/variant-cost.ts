import { Prisma } from "@prisma/client";
import type { Tx } from "../modules/inventory/inventory.service.js";

/**
 * Resolves per-variant unit cost: WAC from received purchase lines, else catalog cost_price.
 */
export async function resolveVariantUnitCosts(
  tx: Tx,
  variantIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const unique = [...new Set(variantIds)];
  if (unique.length === 0) return new Map();

  const rows = await tx.$queryRaw<
    { variant_id: string; unit_cost: string | null }[]
  >(Prisma.sql`
    WITH wac AS (
      SELECT
        variant_id,
        CASE
          WHEN SUM(quantity_received::numeric) > 0 THEN
            SUM(quantity_received::numeric * unit_cost_exclusive::numeric)
            / NULLIF(SUM(quantity_received::numeric), 0)
          ELSE NULL
        END AS unit_cost_wac
      FROM purchase_order_items
      WHERE quantity_received > 0
        AND variant_id IN (${Prisma.join(unique)})
      GROUP BY variant_id
    )
    SELECT
      pv.id AS variant_id,
      COALESCE(w.unit_cost_wac, pv.cost_price, 0::numeric)::text AS unit_cost
    FROM product_variants pv
    LEFT JOIN wac w ON w.variant_id = pv.id
    WHERE pv.id IN (${Prisma.join(unique)})
  `);

  const map = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    map.set(row.variant_id, new Prisma.Decimal(row.unit_cost ?? 0));
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, new Prisma.Decimal(0));
  }
  return map;
}
