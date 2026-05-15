import type { Request } from "express";
import { z } from "zod";
import { AppError } from "../middleware/error-handler.js";

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Invalid request body",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

export function getQueryRecord(req: Request): Record<string, unknown> {
  return req.query as Record<string, unknown>;
}

export function getAuthUserId(req: Request): string | null {
  return req.auth?.userId ?? null;
}
