import { Prisma } from "@prisma/client";

/**
 * Which master fields a bulk-import row updates on an EXISTING variant (same SKU).
 * Scope is deliberately narrow (approved):
 *  - costPrice / listPrice update ONLY when the sheet value is > 0 (blank/0 preserves existing).
 *  - lowStockThreshold updates only when a value is supplied (null/blank preserves existing).
 *  - GST fields and product-level fields are NEVER included here.
 * Returns an empty object when nothing should change.
 */
export function resolveVariantMasterUpdate(raw: {
  cost_price: number;
  list_price: number;
  low_stock_threshold: number | null;
}): Prisma.ProductVariantUpdateInput {
  const data: Prisma.ProductVariantUpdateInput = {};
  if (raw.cost_price > 0) data.costPrice = new Prisma.Decimal(raw.cost_price);
  if (raw.list_price > 0) data.listPrice = new Prisma.Decimal(raw.list_price);
  if (raw.low_stock_threshold != null && raw.low_stock_threshold >= 0) {
    data.lowStockThreshold = Math.max(0, Math.floor(raw.low_stock_threshold));
  }
  return data;
}
