import { PurchaseReturnSettlement } from "@prisma/client";
import { z } from "zod";

const returnLineSchema = z.object({
  variantId: z.string().cuid(),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
});

export const previewPurchaseReturnSchema = z.object({
  lines: z.array(returnLineSchema).min(1).max(500),
});

export const createPurchaseReturnSchema = z.object({
  supplierId: z.string().cuid(),
  lines: z.array(returnLineSchema).min(1).max(500),
  refundAmount: z.coerce.number().min(0).max(1_000_000_000),
  settlementMethod: z.nativeEnum(PurchaseReturnSettlement).default(PurchaseReturnSettlement.CASH),
  note: z.string().max(500).nullable().optional(),
  idempotencyKey: z.string().min(8).max(200),
  /** Book value the user saw in the preview; the confirm is rejected if WAC has since moved. */
  expectedBookValue: z.coerce.number().min(0).optional(),
});

export type CreatePurchaseReturnBody = z.infer<typeof createPurchaseReturnSchema>;
export type PreviewPurchaseReturnBody = z.infer<typeof previewPurchaseReturnSchema>;
