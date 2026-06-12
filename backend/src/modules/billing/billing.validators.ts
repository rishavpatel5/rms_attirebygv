import {
  GstPricingMode,
  PaymentMethod,
  PaymentNature,
  Prisma,
  RetailDiscountType,
} from "@prisma/client";
import { z } from "zod";

const decimalLike = z.union([
  z.string().regex(/^-?\d+(\.\d+)?$/),
  z.number(),
]);

function toDec(v: z.infer<typeof decimalLike>): Prisma.Decimal {
  return new Prisma.Decimal(v);
}

const gstPricingModeSchema = z.nativeEnum(GstPricingMode);

const paymentMethodSchema = z.nativeEnum(PaymentMethod);

const paymentNatureSchema = z.nativeEnum(PaymentNature);

const retailDiscountTypeSchema = z.nativeEnum(RetailDiscountType);

export const cartDiscountSchema = z
  .object({
    type: retailDiscountTypeSchema,
    value: decimalLike,
  })
  .optional()
  .nullable();

const paymentRowSchema = z.object({
  method: paymentMethodSchema,
  amount: decimalLike,
  nature: paymentNatureSchema.default(PaymentNature.RECEIPT),
  externalRef: z.string().max(256).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const posLineSchema = z.object({
  variantId: z.string().cuid(),
  quantity: z.number().int().positive(),
  unitPrice: decimalLike,
  isGiveaway: z.boolean().optional().default(false),
  giveawayReason: z.string().max(500).nullable().optional(),
  /** @deprecated Prefer itemDiscountType + itemDiscountValue */
  lineDiscount: decimalLike.optional().default(0),
  itemDiscountType: retailDiscountTypeSchema.optional().nullable(),
  itemDiscountValue: decimalLike.optional().nullable(),
  gstPricingMode: gstPricingModeSchema.optional(),
  cgstRate: decimalLike.optional().default(0),
  sgstRate: decimalLike.optional().default(0),
  igstRate: decimalLike.optional().default(0),
});

const posCustomerSnapshotSchema = z
  .object({
    fullName: z.string().max(200).optional(),
    phone: z.string().max(40).optional().nullable(),
  })
  .optional()
  .nullable();

const posCheckoutCoreSchema = z.object({
  customerId: z.string().cuid().nullable().optional(),
  /** When set without `customerId`, server resolves by phone (unique) or creates a customer. */
  customerSnapshot: posCustomerSnapshotSchema,
  gstEnabled: z.boolean(),
  gstPricingMode: gstPricingModeSchema.default(GstPricingMode.INCLUSIVE),
  currency: z.string().min(1).max(8).default("INR"),
  notes: z.string().max(2000).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128).nullable().optional(),
  offerId: z.string().cuid().nullable().optional(),
  /** Cart-level % or flat discount (distributed across lines for GST). */
  cartDiscount: cartDiscountSchema,
  /** @deprecated Use cartDiscount — flat rupee off the bill. */
  orderCashDiscount: decimalLike.optional().default(0),
  lines: z.array(posLineSchema).min(1).max(200),
  payments: z.array(paymentRowSchema).min(1).max(20),
});

export const posCheckoutBodySchema = posCheckoutCoreSchema.superRefine((val, ctx) => {
  if (val.gstEnabled) {
    for (const [i, line] of val.lines.entries()) {
      const cgst = Number(line.cgstRate ?? 0);
      const sgst = Number(line.sgstRate ?? 0);
      const igst = Number(line.igstRate ?? 0);
      if (cgst < 0 || sgst < 0 || igst < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", i],
          message: "GST rates must be non-negative",
        });
      }
    }
  }
});

export type PosCheckoutBody = z.output<typeof posCheckoutBodySchema>;

export const posQuoteBodySchema = posCheckoutCoreSchema.omit({ payments: true });

export type PosQuoteBody = z.output<typeof posQuoteBodySchema>;

export const createDraftOrderBodySchema = posCheckoutCoreSchema
  .omit({ payments: true })
  .extend({
    payments: z.array(paymentRowSchema).max(20).optional().default([]),
  });

export type DraftOrderBody = z.output<typeof createDraftOrderBodySchema>;

export const confirmOrderBodySchema = z.object({
  payments: z.array(paymentRowSchema).min(1).max(20),
  idempotencyKey: z.string().min(8).max(128).nullable().optional(),
});

const creditLineByOrderItemSchema = z.object({
  orderItemId: z.string().cuid(),
  quantity: z.number().int().positive(),
  restock: z.boolean(),
});

export const createCreditNoteBodySchema = z.object({
  originalSaleId: z.string().cuid(),
  notes: z.string().max(2000).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128).nullable().optional(),
  gstEnabled: z.boolean(),
  gstPricingMode: gstPricingModeSchema.default(GstPricingMode.INCLUSIVE),
  lines: z.array(creditLineByOrderItemSchema).min(1).max(200),
  payments: z
    .array(
      paymentRowSchema.extend({
        nature: z.literal(PaymentNature.REFUND),
      }),
    )
    .min(1)
    .max(20),
});

export const exchangeBodySchema = z.object({
  originalOrderId: z.string().cuid(),
  notes: z.string().max(2000).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128).nullable().optional(),
  returnLines: z
    .array(
      z.object({
        orderItemId: z.string().cuid(),
        quantity: z.number().int().positive(),
        disposition: z.enum(["RESTOCK", "NO_RESTOCK"]),
      }),
    )
    .min(1)
    .max(200),
  newSale: z.object({
    gstEnabled: z.boolean(),
    gstPricingMode: gstPricingModeSchema.default(GstPricingMode.INCLUSIVE),
    currency: z.string().min(1).max(8).default("INR"),
    cartDiscount: cartDiscountSchema,
    orderCashDiscount: decimalLike.optional().default(0),
    lines: z.array(posLineSchema).min(1).max(200),
    payments: z.array(paymentRowSchema).min(1).max(20),
  }),
});

export type CreditNoteBody = z.output<typeof createCreditNoteBodySchema>;
export type ExchangeBody = z.output<typeof exchangeBodySchema>;

export function mapPosLineRates(line: z.infer<typeof posLineSchema>) {
  return {
    variantId: line.variantId,
    quantity: line.quantity,
    unitPrice: toDec(line.unitPrice),
    isGiveaway: line.isGiveaway ?? false,
    giveawayReason: line.giveawayReason?.trim() || null,
    lineDiscount: toDec(line.lineDiscount ?? 0),
    itemDiscountType: line.itemDiscountType ?? null,
    itemDiscountValue:
      line.itemDiscountValue != null ? toDec(line.itemDiscountValue) : null,
    gstPricingMode: line.gstPricingMode,
    cgstRate: toDec(line.cgstRate ?? 0),
    sgstRate: toDec(line.sgstRate ?? 0),
    igstRate: toDec(line.igstRate ?? 0),
  };
}

export type PaymentInputRow = {
  method: PaymentMethod;
  amount: z.infer<typeof decimalLike>;
  nature?: PaymentNature;
  externalRef?: string | null;
  metadata?: Record<string, unknown>;
};

export function mapPayments(rows: PaymentInputRow[]) {
  return rows.map((p) => ({
    method: p.method,
    amount: toDec(p.amount),
    nature: p.nature ?? PaymentNature.RECEIPT,
    externalRef: p.externalRef ?? null,
    metadata: p.metadata,
  }));
}
