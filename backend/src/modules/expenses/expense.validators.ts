import { ExpenseCategory, ExpensePaymentMode } from "@prisma/client";
import { z } from "zod";

export const createExpenseBodySchema = z.object({
  title: z.string().min(1).max(200),
  amount: z.number().positive(),
  category: z.nativeEnum(ExpenseCategory),
  paymentMode: z.nativeEnum(ExpensePaymentMode).default(ExpensePaymentMode.CASH),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  note: z.string().max(500).optional().nullable(),
});

export const updateExpenseBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  amount: z.number().positive().optional(),
  category: z.nativeEnum(ExpenseCategory).optional(),
  paymentMode: z.nativeEnum(ExpensePaymentMode).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional().nullable(),
});

export type CreateExpenseBody = z.output<typeof createExpenseBodySchema>;
export type UpdateExpenseBody = z.output<typeof updateExpenseBodySchema>;
