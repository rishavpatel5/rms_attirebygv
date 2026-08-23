import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextUniqueCategorySlug,
  nextUniqueSizeCode,
  nextUniqueSlug,
  sizeCodeBase,
} from "./bulk-import-catalog-keys.js";

test("product slug: unique first time, then base-1, base-2 against existing + in-batch", () => {
  const used = new Set<string>(["whey"]);
  assert.equal(nextUniqueSlug("whey", used), "whey-1"); // whey taken
  assert.equal(nextUniqueSlug("whey", used), "whey-2"); // whey, whey-1 taken
  assert.equal(nextUniqueSlug("creatine", used), "creatine"); // free
  assert.equal(nextUniqueSlug("creatine", used), "creatine-1");
});

test("category slug compounds: base, base-1, base-1-2 (matches old uniqueCategorySlug)", () => {
  const used = new Set<string>(["snacks", "snacks-1", "snacks-1-2"]);
  // base 'snacks' taken -> 'snacks-1' taken -> 'snacks-1-2' taken -> 'snacks-1-2-3'
  assert.equal(nextUniqueCategorySlug("snacks", used), "snacks-1-2-3");
  assert.equal(nextUniqueCategorySlug("bars", used), "bars");
});

test("size code base: uppercase, non-alnum -> underscore, capped at 20", () => {
  assert.equal(sizeCodeBase("500 g"), "500_G");
  assert.equal(sizeCodeBase("60 tablets"), "60_TABLETS");
  assert.equal(sizeCodeBase("x".repeat(30)), "X".repeat(20));
});

test("size code collision compounds like the old code (1KG -> 1KG_1 -> 1KG_1_2)", () => {
  const used = new Set<string>(["1KG"]);
  assert.equal(nextUniqueSizeCode("1kg", used), "1KG_1"); // 1KG taken
  assert.equal(nextUniqueSizeCode("1kg", used), "1KG_1_2"); // 1KG, 1KG_1 taken -> compounds
  // fresh label is untouched
  assert.equal(nextUniqueSizeCode("2kg", used), "2KG");
});

test("each generator reserves its result so the same batch never repeats a key", () => {
  const used = new Set<string>();
  const a = nextUniqueSlug("p", used);
  const b = nextUniqueSlug("p", used);
  const c = nextUniqueSlug("p", used);
  assert.deepEqual([a, b, c], ["p", "p-1", "p-2"]);
  assert.equal(used.size, 3);
});
