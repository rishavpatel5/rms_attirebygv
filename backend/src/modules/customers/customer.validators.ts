import { z } from "zod";

export const createCustomerBodySchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
});

export const updateCustomerBodySchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
});
