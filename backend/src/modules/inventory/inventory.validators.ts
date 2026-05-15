import {
  StockAdjustmentReason,
  type InventoryMovementType,
} from "@prisma/client";
import { z } from "zod";

export const stockAdjustmentBodySchema = z.object({
  reason: z.nativeEnum(StockAdjustmentReason),
  note: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        variantId: z.string().cuid(),
        quantityDelta: z.number().int().min(-1_000_000).max(1_000_000),
        movementType: z.enum(["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE_OUT"]),
      }),
    )
    .min(1)
    .max(200),
});

export type StockAdjustmentBody = z.infer<typeof stockAdjustmentBodySchema>;

export function mapMovementType(
  t: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "DAMAGE_OUT",
): InventoryMovementType {
  return t as InventoryMovementType;
}
