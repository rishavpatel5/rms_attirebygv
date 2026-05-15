import { UserRole } from "@prisma/client";
import { z } from "zod";

export const loginBodySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email("Invalid email")),
  password: z.string().min(1, "Password is required"),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20, "Refresh token is required"),
});

export const logoutBodySchema = refreshBodySchema;

export const createUserBodySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email("Invalid email")),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password is too long"),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.nativeEnum(UserRole),
});

export const bootstrapBodySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email("Invalid email")),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password is too long"),
  name: z.string().trim().min(1).max(120).optional(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type BootstrapBody = z.infer<typeof bootstrapBodySchema>;
