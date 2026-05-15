import type { UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../middleware/error-handler.js";

export function requireRoles(...allowed: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(
        new AppError(401, "UNAUTHORIZED", "Authentication required"),
      );
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      next(
        new AppError(
          403,
          "FORBIDDEN",
          "You do not have permission to perform this action",
        ),
      );
      return;
    }
    next();
  };
}
