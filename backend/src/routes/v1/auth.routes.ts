import { UserRole } from "@prisma/client";
import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { AppError } from "../../middleware/error-handler.js";
import {
  bootstrapBodySchema,
  createUserBodySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
} from "../../modules/auth/auth.validators.js";
import * as authService from "../../modules/auth/auth.service.js";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const authRouter = Router();

function validateBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid request body", parsed.error.flatten());
  }
  return parsed.data;
}

function clientMeta(req: Request): {
  userAgent: string | null;
  ipAddress: string | null;
} {
  const forwarded = req.headers["x-forwarded-for"];
  const ipFromForwarded =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim() ?? null
      : null;
  return {
    userAgent:
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : null,
    ipAddress: req.ip ?? ipFromForwarded,
  };
}

authRouter.post(
  "/bootstrap",
  asyncHandler(async (req, res) => {
    const body = validateBody(bootstrapBodySchema, req.body);
    const out = await authService.bootstrapFirstAdmin(body, clientMeta(req));
    res.status(201).json({ data: out });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = validateBody(loginBodySchema, req.body);
    const out = await authService.login(body, clientMeta(req));
    res.json({ data: out });
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = validateBody(refreshBodySchema, req.body);
    const out = await authService.refreshSession(
      body.refreshToken,
      clientMeta(req),
    );
    res.json({ data: out });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const body = validateBody(logoutBodySchema, req.body);
    await authService.logout(body.refreshToken);
    res.status(204).send();
  }),
);

authRouter.post(
  "/logout-all",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    await authService.logoutAll(req.auth.userId);
    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    const user = await authService.getMe(req.auth.userId);
    res.json({ data: { user } });
  }),
);

authRouter.post(
  "/users",
  authenticate,
  requireRoles(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const body = validateBody(createUserBodySchema, req.body);
    const user = await authService.createUser(body);
    res.status(201).json({ data: { user } });
  }),
);
