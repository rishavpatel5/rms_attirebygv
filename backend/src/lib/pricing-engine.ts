import type { GstPricingMode, RetailDiscountType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { AppError } from "../middleware/error-handler.js";
import { computeLine, type ComputedLine, type GstRates, type OrderTotals } from "./gst-calculator.js";

const D2 = (d: Prisma.Decimal): Prisma.Decimal =>
  d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const D4 = (d: Prisma.Decimal): Prisma.Decimal =>
  d.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

export type ItemDiscountSpec = {
  itemDiscountType?: RetailDiscountType | null;
  itemDiscountValue?: Prisma.Decimal | null;
  /** Legacy: flat rupee discount on the line (used when type/value omitted). */
  lineDiscount?: Prisma.Decimal | null;
};

export type CartDiscountSpec = {
  cartDiscountType?: RetailDiscountType | null;
  cartDiscountValue?: Prisma.Decimal | null;
  /** @deprecated Use cartDiscount — flat cart discount in rupees. */
  orderCashDiscount?: Prisma.Decimal | null;
};

export type PricingLineInput = {
  variantId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  gstEnabled: boolean;
  gstPricingMode: GstPricingMode;
  isGiveaway?: boolean;
  giveawayReason?: string | null;
} & GstRates &
  ItemDiscountSpec;

export type FinalPricingLine = ComputedLine & {
  itemDiscountType: RetailDiscountType | null;
  itemDiscountValue: Prisma.Decimal | null;
  itemDiscountAmount: Prisma.Decimal;
  cartDiscountAllocated: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  isGiveaway: boolean;
  giveawayReason: string | null;
};

export type PricingQuoteResult = {
  lines: FinalPricingLine[];
  totals: OrderTotals & {
    itemDiscountTotal: Prisma.Decimal;
    cartDiscountAmount: Prisma.Decimal;
    grossSubtotal: Prisma.Decimal;
  };
  cartDiscount: {
    type: RetailDiscountType | null;
    value: Prisma.Decimal | null;
    amount: Prisma.Decimal;
  };
};

function totalRatePercent(r: GstRates): Prisma.Decimal {
  return D4(r.cgstRate.plus(r.sgstRate).plus(r.igstRate));
}

function splitGstFromTaxable(
  taxableValue: Prisma.Decimal,
  rates: GstRates,
): { cgstAmount: Prisma.Decimal; sgstAmount: Prisma.Decimal; igstAmount: Prisma.Decimal } {
  return {
    cgstAmount: D4(taxableValue.mul(rates.cgstRate).div(100)),
    sgstAmount: D4(taxableValue.mul(rates.sgstRate).div(100)),
    igstAmount: D4(taxableValue.mul(rates.igstRate).div(100)),
  };
}

/** Item discount in rupees from % or flat; capped at line gross. */
export function resolveItemDiscountAmount(
  quantity: number,
  unitPrice: Prisma.Decimal,
  spec: ItemDiscountSpec,
): { amount: Prisma.Decimal; type: RetailDiscountType | null; value: Prisma.Decimal | null } {
  const qty = new Prisma.Decimal(quantity);
  const gross = D4(qty.mul(unitPrice));
  if (gross.lte(0)) {
    return { amount: new Prisma.Decimal(0), type: null, value: null };
  }

  const legacyFlat = spec.lineDiscount ?? new Prisma.Decimal(0);
  const type = spec.itemDiscountType ?? null;
  const value = spec.itemDiscountValue ?? null;

  if (type && value != null && value.gt(0)) {
    let amount: Prisma.Decimal;
    if (type === "PERCENT") {
      if (value.gt(100)) {
        throw new AppError(400, "INVALID_ITEM_DISCOUNT", "Item discount percent cannot exceed 100");
      }
      amount = D4(gross.mul(value).div(100));
    } else {
      amount = D4(value);
    }
    if (amount.gt(gross)) amount = gross;
    if (amount.lt(0)) amount = new Prisma.Decimal(0);
    return { amount, type, value: D4(value) };
  }

  if (legacyFlat.gt(0)) {
    const amount = legacyFlat.gt(gross) ? gross : D4(legacyFlat);
    return { amount, type: "FLAT_AMOUNT", value: amount };
  }

  return { amount: new Prisma.Decimal(0), type: null, value: null };
}

type PreCartLine = ComputedLine & {
  itemDiscountType: RetailDiscountType | null;
  itemDiscountValue: Prisma.Decimal | null;
  itemDiscountAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  isGiveaway: boolean;
  giveawayReason: string | null;
};

function applyCartSliceToLine(line: PreCartLine, cartSlice: Prisma.Decimal): FinalPricingLine {
  const meta = { isGiveaway: false as const, giveawayReason: null as string | null };
  if (cartSlice.lte(0)) {
    return {
      ...line,
      cartDiscountAllocated: new Prisma.Decimal(0),
      lineDiscount: D4(line.itemDiscountAmount),
      ...meta,
    };
  }

  const rates: GstRates = {
    cgstRate: line.cgstRate,
    sgstRate: line.sgstRate,
    igstRate: line.igstRate,
  };

  if (!line.gstEnabled || line.lineTotal.lte(0)) {
    const rawTotal = line.lineTotal.minus(cartSlice);
    const newTotal = D4(rawTotal.lt(0) ? new Prisma.Decimal(0) : rawTotal);
    return {
      ...line,
      cartDiscountAllocated: D4(cartSlice),
      lineDiscount: D4(line.itemDiscountAmount.plus(cartSlice)),
      taxableValue: newTotal,
      cgstAmount: new Prisma.Decimal(0),
      sgstAmount: new Prisma.Decimal(0),
      igstAmount: new Prisma.Decimal(0),
      lineTotal: newTotal,
      ...meta,
    };
  }

  if (line.gstPricingMode === "INCLUSIVE") {
    const rawInclusive = line.lineTotal.minus(cartSlice);
    const newLineTotal = D4(rawInclusive.lt(0) ? new Prisma.Decimal(0) : rawInclusive);
    const tp = totalRatePercent(rates);
    const divisor = new Prisma.Decimal(1).plus(tp.div(100));
    const newTaxable = D4(newLineTotal.div(divisor));
    const gstParts = splitGstFromTaxable(newTaxable, rates);
    return {
      ...line,
      cartDiscountAllocated: D4(cartSlice),
      lineDiscount: D4(line.itemDiscountAmount.plus(cartSlice)),
      taxableValue: newTaxable,
      ...gstParts,
      lineTotal: D4(newTaxable.plus(gstParts.cgstAmount).plus(gstParts.sgstAmount).plus(gstParts.igstAmount)),
      ...meta,
    };
  }

  const rawTaxable = line.taxableValue.minus(cartSlice);
  const newTaxable = D4(rawTaxable.lt(0) ? new Prisma.Decimal(0) : rawTaxable);
  const gstParts = splitGstFromTaxable(newTaxable, rates);
  const newLineTotal = D4(newTaxable.plus(gstParts.cgstAmount).plus(gstParts.sgstAmount).plus(gstParts.igstAmount));
  return {
    ...line,
    cartDiscountAllocated: D4(cartSlice),
    lineDiscount: D4(line.itemDiscountAmount.plus(cartSlice)),
    taxableValue: newTaxable,
    ...gstParts,
    lineTotal: newLineTotal,
    ...meta,
  };
}

function resolveCartDiscountAmount(
  baseAfterItemDiscounts: Prisma.Decimal,
  spec: CartDiscountSpec,
): { amount: Prisma.Decimal; type: RetailDiscountType | null; value: Prisma.Decimal | null } {
  const legacyFlat = spec.orderCashDiscount ?? new Prisma.Decimal(0);
  const type = spec.cartDiscountType ?? null;
  const value = spec.cartDiscountValue ?? null;

  if (type && value != null && value.gt(0)) {
    if (baseAfterItemDiscounts.lte(0)) {
      return { amount: new Prisma.Decimal(0), type, value: D4(value) };
    }
    let amount: Prisma.Decimal;
    if (type === "PERCENT") {
      if (value.gt(100)) {
        throw new AppError(400, "INVALID_CART_DISCOUNT", "Cart discount percent cannot exceed 100");
      }
      amount = D2(baseAfterItemDiscounts.mul(value).div(100));
    } else {
      amount = D2(value);
    }
    if (amount.gt(baseAfterItemDiscounts)) amount = D2(baseAfterItemDiscounts);
    if (amount.lt(0)) amount = new Prisma.Decimal(0);
    return { amount, type, value: D4(value) };
  }

  if (legacyFlat.gt(0)) {
    const amount = legacyFlat.gt(baseAfterItemDiscounts)
      ? D2(baseAfterItemDiscounts)
      : D2(legacyFlat);
    return { amount, type: "FLAT_AMOUNT", value: amount };
  }

  return { amount: new Prisma.Decimal(0), type: null, value: null };
}

function distributeCartDiscount(lines: PreCartLine[], cartAmount: Prisma.Decimal): FinalPricingLine[] {
  if (cartAmount.lte(0) || lines.length === 0) {
    return lines.map((ln) => ({
      ...ln,
      cartDiscountAllocated: new Prisma.Decimal(0),
      lineDiscount: D4(ln.itemDiscountAmount),
      isGiveaway: ln.isGiveaway ?? false,
      giveawayReason: ln.giveawayReason ?? null,
    }));
  }

  const weights = lines.map((ln) => (ln.lineTotal.gt(0) ? ln.lineTotal : new Prisma.Decimal(0)));
  let weightSum = new Prisma.Decimal(0);
  for (const w of weights) weightSum = weightSum.plus(w);

  if (weightSum.lte(0)) {
    return lines.map((ln) => ({
      ...ln,
      cartDiscountAllocated: new Prisma.Decimal(0),
      lineDiscount: D4(ln.itemDiscountAmount),
      isGiveaway: ln.isGiveaway ?? false,
      giveawayReason: ln.giveawayReason ?? null,
    }));
  }

  const allocations: Prisma.Decimal[] = [];
  let allocated = new Prisma.Decimal(0);
  for (let i = 0; i < lines.length; i++) {
    if (i === lines.length - 1) {
      allocations.push(D2(cartAmount.minus(allocated)));
    } else {
      const slice = D2(cartAmount.mul(weights[i]!).div(weightSum));
      allocations.push(slice);
      allocated = allocated.plus(slice);
    }
  }

  return lines.map((ln, i) => {
    const sliced = applyCartSliceToLine(ln, allocations[i] ?? new Prisma.Decimal(0));
    return {
      ...sliced,
      isGiveaway: ln.isGiveaway ?? false,
      giveawayReason: ln.giveawayReason ?? null,
    };
  });
}

function buildGiveawayLine(
  input: PricingLineInput,
  orderGst: { gstEnabled: boolean; gstPricingMode: GstPricingMode },
): PreCartLine {
  const grossAmount = D4(new Prisma.Decimal(input.quantity).mul(input.unitPrice));
  return {
    variantId: input.variantId,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    lineDiscount: new Prisma.Decimal(0),
    taxableValue: new Prisma.Decimal(0),
    cgstRate: input.cgstRate,
    sgstRate: input.sgstRate,
    igstRate: input.igstRate,
    cgstAmount: new Prisma.Decimal(0),
    sgstAmount: new Prisma.Decimal(0),
    igstAmount: new Prisma.Decimal(0),
    lineTotal: new Prisma.Decimal(0),
    gstEnabled: orderGst.gstEnabled,
    gstPricingMode: input.gstPricingMode ?? orderGst.gstPricingMode,
    itemDiscountType: null,
    itemDiscountValue: null,
    itemDiscountAmount: new Prisma.Decimal(0),
    grossAmount,
    isGiveaway: true,
    giveawayReason: input.giveawayReason?.trim() || null,
  };
}

function aggregateTotals(
  lines: FinalPricingLine[],
  cartMeta: { amount: Prisma.Decimal; type: RetailDiscountType | null; value: Prisma.Decimal | null },
): PricingQuoteResult["totals"] {
  let grossSubtotal = new Prisma.Decimal(0);
  let itemDiscountTotal = new Prisma.Decimal(0);
  let taxableValue = new Prisma.Decimal(0);
  let cgstTotal = new Prisma.Decimal(0);
  let sgstTotal = new Prisma.Decimal(0);
  let igstTotal = new Prisma.Decimal(0);
  let sumLineTotal = new Prisma.Decimal(0);

  for (const ln of lines) {
    grossSubtotal = grossSubtotal.plus(ln.grossAmount);
    itemDiscountTotal = itemDiscountTotal.plus(ln.itemDiscountAmount);
    taxableValue = taxableValue.plus(ln.taxableValue);
    cgstTotal = cgstTotal.plus(ln.cgstAmount);
    sgstTotal = sgstTotal.plus(ln.sgstAmount);
    igstTotal = igstTotal.plus(ln.igstAmount);
    sumLineTotal = sumLineTotal.plus(ln.lineTotal);
  }

  const grandTotal = D2(sumLineTotal);
  const roundingAdjustment = D2(grandTotal.minus(sumLineTotal));

  return {
    grossSubtotal: D2(grossSubtotal),
    subtotal: D2(grossSubtotal),
    itemDiscountTotal: D2(itemDiscountTotal),
    cartDiscountAmount: D2(cartMeta.amount),
    discountTotal: D2(itemDiscountTotal.plus(cartMeta.amount)),
    taxableValue: D2(taxableValue),
    cgstTotal: D2(cgstTotal),
    sgstTotal: D2(sgstTotal),
    igstTotal: D2(igstTotal),
    cessTotal: new Prisma.Decimal(0),
    grandTotal,
    roundingAdjustment,
  };
}

/**
 * Central POS pricing: item discounts → per-line GST → proportional cart discount → final totals.
 * Single source of truth for billing, quotes, and persisted order lines.
 */
export function computePosPricing(
  lines: PricingLineInput[],
  orderGst: { gstEnabled: boolean; gstPricingMode: GstPricingMode },
  cartSpec: CartDiscountSpec = {},
): PricingQuoteResult {
  if (lines.length === 0) {
    throw new AppError(400, "EMPTY_CART", "Add at least one line");
  }

  const preCart: PreCartLine[] = lines.map((input) => {
    if (input.isGiveaway) {
      return buildGiveawayLine(input, orderGst);
    }
    const itemDisc = resolveItemDiscountAmount(input.quantity, input.unitPrice, input);
    const grossAmount = D4(new Prisma.Decimal(input.quantity).mul(input.unitPrice));
    const computed = computeLine({
      variantId: input.variantId,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      lineDiscount: itemDisc.amount,
      gstEnabled: orderGst.gstEnabled,
      gstPricingMode: input.gstPricingMode ?? orderGst.gstPricingMode,
      cgstRate: input.cgstRate,
      sgstRate: input.sgstRate,
      igstRate: input.igstRate,
    });
    return {
      ...computed,
      itemDiscountType: itemDisc.type,
      itemDiscountValue: itemDisc.value,
      itemDiscountAmount: itemDisc.amount,
      grossAmount,
      isGiveaway: false,
      giveawayReason: null,
    };
  });

  const paidIndices: number[] = [];
  const paidPreCart = preCart.filter((ln, i) => {
    if (!ln.isGiveaway) {
      paidIndices.push(i);
      return true;
    }
    return false;
  });
  const baseAfterItem = paidPreCart.reduce(
    (s, ln) => s.plus(ln.lineTotal),
    new Prisma.Decimal(0),
  );
  const cartResolved = resolveCartDiscountAmount(baseAfterItem, cartSpec);
  const paidFinal = distributeCartDiscount(paidPreCart, cartResolved.amount);
  const finalLines: FinalPricingLine[] = preCart.map((ln): FinalPricingLine => {
    if (ln.isGiveaway) {
      return {
        ...ln,
        cartDiscountAllocated: new Prisma.Decimal(0),
        lineDiscount: new Prisma.Decimal(0),
      };
    }
    return {
      ...ln,
      cartDiscountAllocated: new Prisma.Decimal(0),
      lineDiscount: D4(ln.itemDiscountAmount),
    };
  });
  for (let j = 0; j < paidIndices.length; j++) {
    finalLines[paidIndices[j]!] = paidFinal[j]!;
  }
  const classifiedLines = finalLines.map((ln) =>
    !ln.isGiveaway && ln.lineTotal.lte(0) ? { ...ln, isGiveaway: true } : ln,
  );
  const totals = aggregateTotals(classifiedLines, cartResolved);

  return {
    lines: classifiedLines,
    totals,
    cartDiscount: {
      type: cartResolved.type,
      value: cartResolved.value,
      amount: cartResolved.amount,
    },
  };
}

/** JSON-safe quote payload for POS UI (backend is source of truth). */
export function serializePricingQuote(quote: PricingQuoteResult) {
  const dec = (d: Prisma.Decimal) => d.toFixed(2);
  const dec4 = (d: Prisma.Decimal) => d.toFixed(4);
  return {
    lines: quote.lines.map((ln) => ({
      variantId: ln.variantId,
      quantity: ln.quantity,
      unitPrice: dec4(ln.unitPrice),
      grossAmount: dec(ln.grossAmount),
      itemDiscountType: ln.itemDiscountType,
      itemDiscountValue: ln.itemDiscountValue != null ? dec4(ln.itemDiscountValue) : null,
      itemDiscountAmount: dec(ln.itemDiscountAmount),
      cartDiscountAllocated: dec(ln.cartDiscountAllocated),
      lineDiscount: dec(ln.lineDiscount),
      taxableValue: dec(ln.taxableValue),
      cgstRate: dec4(ln.cgstRate),
      sgstRate: dec4(ln.sgstRate),
      igstRate: dec4(ln.igstRate),
      cgstAmount: dec(ln.cgstAmount),
      sgstAmount: dec(ln.sgstAmount),
      igstAmount: dec(ln.igstAmount),
      lineTotal: dec(ln.lineTotal),
      isGiveaway: ln.isGiveaway,
      giveawayReason: ln.giveawayReason,
    })),
    totals: {
      grossSubtotal: dec(quote.totals.grossSubtotal),
      subtotal: dec(quote.totals.subtotal),
      itemDiscountTotal: dec(quote.totals.itemDiscountTotal),
      cartDiscountAmount: dec(quote.totals.cartDiscountAmount),
      discountTotal: dec(quote.totals.discountTotal),
      taxableValue: dec(quote.totals.taxableValue),
      cgstTotal: dec(quote.totals.cgstTotal),
      sgstTotal: dec(quote.totals.sgstTotal),
      igstTotal: dec(quote.totals.igstTotal),
      grandTotal: dec(quote.totals.grandTotal),
      roundingAdjustment: dec(quote.totals.roundingAdjustment),
    },
    cartDiscount: {
      type: quote.cartDiscount.type,
      value: quote.cartDiscount.value != null ? dec4(quote.cartDiscount.value) : null,
      amount: dec(quote.cartDiscount.amount),
    },
  };
}

export function mapFinalLineToOrderItemCreate(
  ln: FinalPricingLine,
  unitCostSnapshot?: Prisma.Decimal | null,
) {
  const isGiveaway = ln.isGiveaway || ln.lineTotal.lte(0);
  return {
    variantId: ln.variantId,
    quantity: ln.quantity,
    unitPrice: ln.unitPrice,
    itemDiscountType: ln.itemDiscountType,
    itemDiscountValue: ln.itemDiscountValue,
    itemDiscountAmount: ln.itemDiscountAmount,
    cartDiscountAllocated: ln.cartDiscountAllocated,
    lineDiscount: D4(ln.itemDiscountAmount.plus(ln.cartDiscountAllocated)),
    taxableValue: ln.taxableValue,
    cgstRate: ln.cgstRate,
    sgstRate: ln.sgstRate,
    igstRate: ln.igstRate,
    cgstAmount: ln.cgstAmount,
    sgstAmount: ln.sgstAmount,
    igstAmount: ln.igstAmount,
    lineTotal: ln.lineTotal,
    isGiveaway,
    giveawayReason: ln.giveawayReason,
    unitCostSnapshot: isGiveaway ? (unitCostSnapshot ?? new Prisma.Decimal(0)) : null,
  };
}

export function mapQuoteTotalsToOrder(totals: PricingQuoteResult["totals"], cart: PricingQuoteResult["cartDiscount"]) {
  return {
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    itemDiscountTotal: totals.itemDiscountTotal,
    cartDiscountType: cart.type,
    cartDiscountValue: cart.value,
    cartDiscountAmount: totals.cartDiscountAmount,
    taxableValue: totals.taxableValue,
    cgstTotal: totals.cgstTotal,
    sgstTotal: totals.sgstTotal,
    igstTotal: totals.igstTotal,
    cessTotal: totals.cessTotal,
    grandTotal: totals.grandTotal,
    roundingAdjustment: totals.roundingAdjustment,
  };
}
