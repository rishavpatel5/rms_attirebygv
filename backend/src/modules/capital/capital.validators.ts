import { CapitalEntryType } from "@prisma/client";
import { z } from "zod";

export const createCapitalEntryBodySchema = z.object({
  type: z.nativeEnum(CapitalEntryType),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  note: z.string().max(500).optional().nullable(),
});

export const updateCapitalEntryBodySchema = z.object({
  type: z.nativeEnum(CapitalEntryType).optional(),
  amount: z.number().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional().nullable(),
});

// "Set opening capital so cash-in-hand equals this figure."
export const setOpeningCashBodySchema = z.object({
  cashInHand: z.number().nonnegative(),
});

export type CreateCapitalEntryBody = z.output<typeof createCapitalEntryBodySchema>;
export type UpdateCapitalEntryBody = z.output<typeof updateCapitalEntryBodySchema>;
export type SetOpeningCashBody = z.output<typeof setOpeningCashBodySchema>;
