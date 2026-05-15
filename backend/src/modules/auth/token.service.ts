import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import type { AccessTokenPayload, AuthContext } from "./auth.types.js";

export function signAccessToken(
  user: Pick<User, "id" | "email" | "role">,
): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    typ: "access",
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AuthContext {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof decoded === "string" || !("typ" in decoded)) {
      throw new AppError(401, "INVALID_TOKEN", "Invalid access token");
    }
    const payload = decoded as AccessTokenPayload;
    if (payload.typ !== "access" || !payload.sub || !payload.email || !payload.role) {
      throw new AppError(401, "INVALID_TOKEN", "Invalid access token");
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    // jsonwebtoken is CJS; under native ESM, named error classes are not reliable imports.
    if (err instanceof Error && err.name === "TokenExpiredError") {
      throw new AppError(401, "TOKEN_EXPIRED", "Access token expired");
    }
    if (err instanceof Error && err.name === "JsonWebTokenError") {
      throw new AppError(401, "INVALID_TOKEN", "Invalid access token");
    }
    throw err;
  }
}

export function parseBearer(authorization: string | undefined): string | null {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}
