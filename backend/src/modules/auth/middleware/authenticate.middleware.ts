import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../middleware/error-handler.js";
import { parseBearer, verifyAccessToken } from "../token.service.js";

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = parseBearer(req.headers.authorization);
    if (!token) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Missing or invalid Authorization header",
      );
    }
    req.auth = verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}
