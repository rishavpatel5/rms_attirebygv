import type { GstPricingMode } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type GstRates = {
  cgstRate: Prisma.Decimal;
  sgstRate: Prisma.Decimal;
  igstRate: Prisma.Decimal;
};

export type LineCalcInput = {
  variantId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineDiscount: Prisma.Decimal;
  gstEnabled: boolean;
  gstPricingMode: GstPricingMode;
} & GstRates;

export type ComputedLine = LineCalcInput & {
  taxableValue: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

const D4 = (d: Prisma.Decimal): Prisma.Decimal =>
  d.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

function totalRatePercent(r: GstRates): Prisma.Decimal {
  return D4(r.cgstRate.plus(r.sgstRate).plus(r.igstRate));
}

/**
 * GST line math using Prisma.Decimal end-to-end.
 * EXCLUSIVE: tax is applied on (qty*unit - lineDiscount).
 * INCLUSIVE: (qty*unit - lineDiscount) includes tax; taxable is backed out using combined rate.
 */
export function computeLine(input: LineCalcInput): ComputedLine {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new RangeError("quantity must be a positive integer");
  }
  if (input.unitPrice.lt(0) || input.lineDiscount.lt(0)) {
    throw new RangeError("unitPrice and lineDiscount must be non-negative");
  }

  const qty = new Prisma.Decimal(input.quantity);
  const lineMoney = D4(qty.mul(input.unitPrice).minus(input.lineDiscount));

  if (!input.gstEnabled || lineMoney.lte(0)) {
    return {
      ...input,
      taxableValue: D4(lineMoney),
      cgstAmount: new Prisma.Decimal(0),
      sgstAmount: new Prisma.Decimal(0),
      igstAmount: new Prisma.Decimal(0),
      lineTotal: D4(lineMoney),
    };
  }

  const tp = totalRatePercent(input);
  const divisor = new Prisma.Decimal(1).plus(tp.div(100));

  let taxableValue: Prisma.Decimal;
  if (input.gstPricingMode === "INCLUSIVE") {
    taxableValue = D4(lineMoney.div(divisor));
  } else {
    taxableValue = D4(lineMoney);
  }

  const cgstAmount = D4(taxableValue.mul(input.cgstRate).div(100));
  const sgstAmount = D4(taxableValue.mul(input.sgstRate).div(100));
  const igstAmount = D4(taxableValue.mul(input.igstRate).div(100));
  const lineTotal = D4(taxableValue.plus(cgstAmount).plus(sgstAmount).plus(igstAmount));

  return {
    ...input,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    lineTotal,
  };
}

export type OrderTotals = {
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxableValue: Prisma.Decimal;
  cgstTotal: Prisma.Decimal;
  sgstTotal: Prisma.Decimal;
  igstTotal: Prisma.Decimal;
  cessTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  roundingAdjustment: Prisma.Decimal;
};

const D2 = (d: Prisma.Decimal): Prisma.Decimal =>
  d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function computeOrderTotals(
  lines: ComputedLine[],
  orderCashDiscount: Prisma.Decimal,
): OrderTotals {
  if (lines.length === 0) {
    throw new RangeError("lines must not be empty");
  }
  if (orderCashDiscount.lt(0)) {
    throw new RangeError("orderCashDiscount must be non-negative");
  }

  let subtotal = new Prisma.Decimal(0);
  let lineDiscountSum = new Prisma.Decimal(0);
  let taxableValue = new Prisma.Decimal(0);
  let cgstTotal = new Prisma.Decimal(0);
  let sgstTotal = new Prisma.Decimal(0);
  let igstTotal = new Prisma.Decimal(0);
  let sumLineTotal = new Prisma.Decimal(0);

  for (const ln of lines) {
    const qty = new Prisma.Decimal(ln.quantity);
    subtotal = subtotal.plus(D4(qty.mul(ln.unitPrice)));
    lineDiscountSum = lineDiscountSum.plus(D4(ln.lineDiscount));
    taxableValue = taxableValue.plus(ln.taxableValue);
    cgstTotal = cgstTotal.plus(ln.cgstAmount);
    sgstTotal = sgstTotal.plus(ln.sgstAmount);
    igstTotal = igstTotal.plus(ln.igstAmount);
    sumLineTotal = sumLineTotal.plus(ln.lineTotal);
  }

  const rawGrand = sumLineTotal.minus(orderCashDiscount);
  const grandTotal = D2(rawGrand);
  const roundingAdjustment = D2(grandTotal.minus(rawGrand));

  return {
    subtotal: D2(subtotal),
    discountTotal: D2(lineDiscountSum.plus(orderCashDiscount)),
    taxableValue: D2(taxableValue),
    cgstTotal: D2(cgstTotal),
    sgstTotal: D2(sgstTotal),
    igstTotal: D2(igstTotal),
    cessTotal: new Prisma.Decimal(0),
    grandTotal,
    roundingAdjustment,
  };
}
