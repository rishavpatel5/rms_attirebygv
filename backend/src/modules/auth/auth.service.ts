import type { User, UserRole } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { AuthTokens, PublicUser } from "./auth.types.js";
import type { BootstrapBody, CreateUserBody, LoginBody } from "./auth.validators.js";
import { generateOpaqueRefreshToken, hashOpaqueToken } from "./opaque-token.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signAccessToken } from "./token.service.js";

function toPublicUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

function invalidCredentials(): AppError {
  return new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
}

async function persistRefreshToken(
  userId: string,
  plainToken: string,
  meta: { userAgent: string | null; ipAddress: string | null },
): Promise<void> {
  const tokenHash = hashOpaqueToken(plainToken);
  const expiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    },
  });
}

async function issueTokens(
  user: Pick<User, "id" | "email" | "role">,
  meta: { userAgent: string | null; ipAddress: string | null },
): Promise<AuthTokens> {
  const refreshToken = generateOpaqueRefreshToken();
  await persistRefreshToken(user.id, refreshToken, meta);
  const accessToken = signAccessToken(user);
  return {
    accessToken,
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function login(
  body: LoginBody,
  meta: { userAgent: string | null; ipAddress: string | null },
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const user = await prisma.user.findUnique({
    where: { email: body.email },
  });
  if (!user || !user.isActive) {
    throw invalidCredentials();
  }
  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    throw invalidCredentials();
  }
  const tokens = await issueTokens(user, meta);
  return { user: toPublicUser(user), tokens };
}

export async function refreshSession(
  plainRefreshToken: string,
  meta: { userAgent: string | null; ipAddress: string | null },
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const tokenHash = hashOpaqueToken(plainRefreshToken);
  type RefreshTxResult =
    | { ok: false }
    | { ok: true; user: PublicUser; tokens: AuthTokens };

  const result: RefreshTxResult = await prisma.$transaction(async (tx) => {
    const existing = await tx.refreshToken.findUnique({
      where: { tokenHash },
    });
    const now = new Date();
    if (
      !existing ||
      existing.revokedAt !== null ||
      existing.expiresAt <= now
    ) {
      return { ok: false };
    }
    const user = await tx.user.findUnique({ where: { id: existing.userId } });
    if (!user || !user.isActive) {
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: now },
      });
      return { ok: false };
    }
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    });
    const newPlain = generateOpaqueRefreshToken();
    const newHash = hashOpaqueToken(newPlain);
    const expiresAt = new Date(
      now.getTime() +
        env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newHash,
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });
    const accessToken = signAccessToken(user);
    const tokens: AuthTokens = {
      accessToken,
      refreshToken: newPlain,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    };
    return {
      ok: true,
      user: toPublicUser(user),
      tokens,
    };
  });
  if (!result.ok) {
    throw new AppError(
      401,
      "INVALID_REFRESH_TOKEN",
      "Invalid or expired refresh token",
    );
  }
  return { user: result.user, tokens: result.tokens };
}

export async function logout(plainRefreshToken: string): Promise<void> {
  const tokenHash = hashOpaqueToken(plainRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(401, "USER_NOT_FOUND", "User not found");
  }
  return toPublicUser(user);
}

export async function createUser(
  body: CreateUserBody,
): Promise<PublicUser> {
  const passwordHash = await hashPassword(body.password);
  try {
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        role: body.role,
      },
    });
    return toPublicUser(user);
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2002") {
      throw new AppError(409, "EMAIL_IN_USE", "Email is already registered");
    }
    throw e;
  }
}

export async function bootstrapFirstAdmin(
  body: BootstrapBody,
  meta: { userAgent: string | null; ipAddress: string | null },
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  if (!env.AUTH_BOOTSTRAP_ENABLED) {
    throw new AppError(403, "BOOTSTRAP_DISABLED", "Bootstrap is disabled");
  }
  const count = await prisma.user.count();
  if (count > 0) {
    throw new AppError(403, "BOOTSTRAP_UNAVAILABLE", "Bootstrap is no longer available");
  }
  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash,
      name: body.name,
      role: "ADMIN",
    },
  });
  const tokens = await issueTokens(user, meta);
  return { user: toPublicUser(user), tokens };
}

/** Optional maintenance: delete refresh tokens expired more than 30 days ago. */
export async function purgeExpiredRefreshTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const res = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return res.count;
}
