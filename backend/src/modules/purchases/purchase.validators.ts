import { GstPricingMode, PurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";

const decimalLike = z.coerce.number().finite();

export const createPurchaseOrderBodySchema = z.object({
  supplierId: z.string().cuid(),
});

export const updatePurchaseOrderBodySchema = z.object({
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
});

export const purchaseLineInputSchema = z.object({
  variantId: z.string().cuid(),
  quantityOrdered: z.coerce.number().int().min(1).max(1_000_000),
  unitCost: decimalLike.min(0).max(1_000_000),
  gstEnabled: z.boolean().optional().default(true),
  gstPricingMode: z.nativeEnum(GstPricingMode).optional().default(GstPricingMode.EXCLUSIVE),
  cgstRate: decimalLike.min(0).max(100).optional().default(0),
  sgstRate: decimalLike.min(0).max(100).optional().default(0),
  igstRate: decimalLike.min(0).max(100).optional().default(0),
  /** New shelf price (MRP) to write to the variant on receive. Null/0 = leave shelf price alone. */
  mrp: decimalLike.min(0).max(1_000_000).nullable().optional(),
});

export const replacePurchaseLinesBodySchema = z.object({
  lines: z.array(purchaseLineInputSchema).min(1).max(500),
});

export const receivePurchaseBodySchema = z.object({
  /** Per line receive; omit to receive all remaining quantities. */
  lines: z
    .array(
      z.object({
        itemId: z.string().cuid(),
        quantity: z.coerce.number().int().min(1).max(1_000_000),
      }),
    )
    .optional(),
});

export const recordPurchasePaymentBodySchema = z.object({
  amount: decimalLike.min(0.01).max(1_000_000_000),
});
