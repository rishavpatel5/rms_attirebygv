import { createHash, randomBytes } from "node:crypto";

/** URL-safe opaque refresh token (stored in DB as SHA-256 hex). */
export function generateOpaqueRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
