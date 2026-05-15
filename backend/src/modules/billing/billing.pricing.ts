import type { GstPricingMode } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  computePosPricing,
  type CartDiscountSpec,
  type PricingLineInput,
} from "../../lib/pricing-engine.js";
import type { DraftOrderBody, PosCheckoutBody } from "./billing.validators.js";
import { mapPosLineRates } from "./billing.validators.js";

function toDec(v: string | number): Prisma.Decimal {
  return new Prisma.Decimal(v);
}

type CheckoutLikeBody = Pick<
  PosCheckoutBody,
  "lines" | "gstEnabled" | "gstPricingMode" | "cartDiscount" | "orderCashDiscount"
>;

export function buildPosPricingQuote(body: CheckoutLikeBody) {
  const lines: PricingLineInput[] = body.lines.map((ln) => {
    const mapped = mapPosLineRates(ln);
    return {
      variantId: mapped.variantId,
      quantity: mapped.quantity,
      unitPrice: mapped.unitPrice,
      itemDiscountType: mapped.itemDiscountType,
      itemDiscountValue: mapped.itemDiscountValue,
      lineDiscount: mapped.lineDiscount,
      gstEnabled: body.gstEnabled,
      gstPricingMode: (mapped.gstPricingMode ?? body.gstPricingMode) as GstPricingMode,
      cgstRate: mapped.cgstRate,
      sgstRate: mapped.sgstRate,
      igstRate: mapped.igstRate,
    };
  });

  const cartSpec: CartDiscountSpec = {
    cartDiscountType: body.cartDiscount?.type ?? null,
    cartDiscountValue:
      body.cartDiscount?.value != null ? toDec(body.cartDiscount.value) : null,
    orderCashDiscount:
      body.orderCashDiscount != null ? toDec(body.orderCashDiscount) : null,
  };

  return computePosPricing(
    lines,
    { gstEnabled: body.gstEnabled, gstPricingMode: body.gstPricingMode },
    cartSpec,
  );
}

export type { DraftOrderBody, PosCheckoutBody };
