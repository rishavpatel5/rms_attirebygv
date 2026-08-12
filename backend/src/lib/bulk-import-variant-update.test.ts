import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveVariantMasterUpdate } from "./bulk-import-variant-update.js";

const base = { cost_price: 0, list_price: 0, low_stock_threshold: null as number | null };

test("existing SKU with new cost/list prices → both update", () => {
  const d = resolveVariantMasterUpdate({ ...base, cost_price: 900, list_price: 1499 });
  assert.equal(d.costPrice?.toString(), "900");
  assert.equal(d.listPrice?.toString(), "1499");
});

test("blank/zero cost & list → preserved (not in the update)", () => {
  const zero = resolveVariantMasterUpdate({ ...base, cost_price: 0, list_price: 0 });
  assert.equal("costPrice" in zero, false);
  assert.equal("listPrice" in zero, false);
  // Blank cells parse to 0 → same as zero → preserve.
  assert.deepEqual(Object.keys(zero), []);
});

test("one price present, the other blank → only the present one updates", () => {
  const d = resolveVariantMasterUpdate({ ...base, cost_price: 900, list_price: 0 });
  assert.equal(d.costPrice?.toString(), "900");
  assert.equal("listPrice" in d, false);
});

test("threshold supplied updates; null preserves", () => {
  const withT = resolveVariantMasterUpdate({ ...base, low_stock_threshold: 5 });
  assert.equal(withT.lowStockThreshold, 5);
  const noT = resolveVariantMasterUpdate({ ...base, low_stock_threshold: null });
  assert.equal("lowStockThreshold" in noT, false);
});

test("update NEVER contains GST or product-level fields", () => {
  const d = resolveVariantMasterUpdate({ cost_price: 900, list_price: 1499, low_stock_threshold: 5 });
  const keys = Object.keys(d).sort();
  assert.deepEqual(keys, ["costPrice", "listPrice", "lowStockThreshold"]);
  for (const forbidden of [
    "gstEnabled",
    "gstPricingMode",
    "cgstRate",
    "sgstRate",
    "igstRate",
    "sku",
    "productId",
    "colorId",
    "sizeId",
  ]) {
    assert.equal(forbidden in d, false, `${forbidden} must not be updated`);
  }
});
