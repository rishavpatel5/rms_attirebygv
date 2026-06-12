import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GstPricingMode, Prisma } from "@prisma/client";
import { computePosPricing } from "./pricing-engine.js";

const dec = (n: number) => new Prisma.Decimal(n);

describe("computePosPricing giveaway lines", () => {
  it("zeros revenue for a giveaway-only cart", () => {
    const quote = computePosPricing(
      [
        {
          variantId: "variant-giveaway",
          quantity: 1,
          unitPrice: dec(500),
          isGiveaway: true,
          gstEnabled: false,
          gstPricingMode: GstPricingMode.INCLUSIVE,
          cgstRate: dec(0),
          sgstRate: dec(0),
          igstRate: dec(0),
        },
      ],
      { gstEnabled: false, gstPricingMode: GstPricingMode.INCLUSIVE },
    );

    assert.equal(quote.lines.length, 1);
    assert.equal(quote.lines[0]!.isGiveaway, true);
    assert.equal(quote.lines[0]!.lineTotal.toNumber(), 0);
    assert.equal(quote.totals.grandTotal.toNumber(), 0);
  });

  it("bills paid lines only in a mixed cart", () => {
    const quote = computePosPricing(
      [
        {
          variantId: "variant-paid-1",
          quantity: 2,
          unitPrice: dec(1000),
          gstEnabled: false,
          gstPricingMode: GstPricingMode.INCLUSIVE,
          cgstRate: dec(0),
          sgstRate: dec(0),
          igstRate: dec(0),
        },
        {
          variantId: "variant-paid-2",
          quantity: 2,
          unitPrice: dec(1000),
          gstEnabled: false,
          gstPricingMode: GstPricingMode.INCLUSIVE,
          cgstRate: dec(0),
          sgstRate: dec(0),
          igstRate: dec(0),
        },
        {
          variantId: "variant-giveaway",
          quantity: 1,
          unitPrice: dec(800),
          isGiveaway: true,
          gstEnabled: false,
          gstPricingMode: GstPricingMode.INCLUSIVE,
          cgstRate: dec(0),
          sgstRate: dec(0),
          igstRate: dec(0),
        },
      ],
      { gstEnabled: false, gstPricingMode: GstPricingMode.INCLUSIVE },
    );

    const paidTotal = quote.lines
      .filter((ln) => !ln.isGiveaway)
      .reduce((sum, ln) => sum + ln.lineTotal.toNumber(), 0);
    const giveawayTotal = quote.lines
      .filter((ln) => ln.isGiveaway)
      .reduce((sum, ln) => sum + ln.lineTotal.toNumber(), 0);

    assert.equal(paidTotal, 4000);
    assert.equal(giveawayTotal, 0);
    assert.equal(quote.totals.grandTotal.toNumber(), 4000);
  });

  it("excludes giveaway lines from cart discount distribution", () => {
    const quote = computePosPricing(
      [
        {
          variantId: "variant-paid",
          quantity: 1,
          unitPrice: dec(1000),
          gstEnabled: false,
          gstPricingMode: GstPricingMode.INCLUSIVE,
          cgstRate: dec(0),
          sgstRate: dec(0),
          igstRate: dec(0),
        },
        {
          variantId: "variant-giveaway",
          quantity: 1,
          unitPrice: dec(500),
          isGiveaway: true,
          gstEnabled: false,
          gstPricingMode: GstPricingMode.INCLUSIVE,
          cgstRate: dec(0),
          sgstRate: dec(0),
          igstRate: dec(0),
        },
      ],
      { gstEnabled: false, gstPricingMode: GstPricingMode.INCLUSIVE },
      { cartDiscountType: "PERCENT", cartDiscountValue: dec(10) },
    );

    const paid = quote.lines.find((ln) => !ln.isGiveaway)!;
    const giveaway = quote.lines.find((ln) => ln.isGiveaway)!;

    assert.equal(paid.lineTotal.toNumber(), 900);
    assert.equal(giveaway.lineTotal.toNumber(), 0);
    assert.equal(giveaway.cartDiscountAllocated.toNumber(), 0);
    assert.equal(quote.totals.grandTotal.toNumber(), 900);
  });

  it("auto-classifies a 100% discounted line as giveaway", () => {
    const quote = computePosPricing(
      [
        {
          variantId: "variant-discounted",
          quantity: 1,
          unitPrice: dec(500),
          itemDiscountType: "PERCENT",
          itemDiscountValue: dec(100),
          gstEnabled: false,
          gstPricingMode: GstPricingMode.INCLUSIVE,
          cgstRate: dec(0),
          sgstRate: dec(0),
          igstRate: dec(0),
        },
      ],
      { gstEnabled: false, gstPricingMode: GstPricingMode.INCLUSIVE },
    );

    assert.equal(quote.lines[0]!.lineTotal.toNumber(), 0);
    assert.equal(quote.lines[0]!.isGiveaway, true);
  });

  it("supports the same variant as paid and giveaway on one bill", () => {
    const quote = computePosPricing(
      [
        {
          variantId: "variant-same",
          quantity: 4,
          unitPrice: dec(250),
          gstEnabled: false,
          gstPricingMode: GstPricingMode.INCLUSIVE,
          cgstRate: dec(0),
          sgstRate: dec(0),
          igstRate: dec(0),
        },
        {
          variantId: "variant-same",
          quantity: 1,
          unitPrice: dec(250),
          isGiveaway: true,
          giveawayReason: "Festival offer",
          gstEnabled: false,
          gstPricingMode: GstPricingMode.INCLUSIVE,
          cgstRate: dec(0),
          sgstRate: dec(0),
          igstRate: dec(0),
        },
      ],
      { gstEnabled: false, gstPricingMode: GstPricingMode.INCLUSIVE },
    );

    assert.equal(quote.lines.length, 2);
    assert.equal(quote.lines[0]!.lineTotal.toNumber(), 1000);
    assert.equal(quote.lines[1]!.isGiveaway, true);
    assert.equal(quote.lines[1]!.giveawayReason, "Festival offer");
    assert.equal(quote.lines[1]!.lineTotal.toNumber(), 0);
    assert.equal(quote.totals.grandTotal.toNumber(), 1000);
  });
});
