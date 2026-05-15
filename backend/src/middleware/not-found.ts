import type { Request, Response } from "express";
import type { ApiErrorBody } from "../types/api.js";

export function notFoundHandler(
  req: Request,
  res: Response<ApiErrorBody>,
): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
