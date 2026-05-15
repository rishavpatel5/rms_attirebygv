import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Resolve `backend/.env` regardless of process cwd (e.g. monorepo root). */
const envFilePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.env",
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((s) =>
        s
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
    JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    AUTH_BOOTSTRAP_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
  })
  .superRefine((data, ctx) => {
    const minSecretLen = data.NODE_ENV === "production" ? 32 : 16;
    if (data.JWT_ACCESS_SECRET.length < minSecretLen) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `JWT_ACCESS_SECRET must be at least ${minSecretLen} characters in ${data.NODE_ENV}`,
        path: ["JWT_ACCESS_SECRET"],
      });
    }
    if (data.JWT_REFRESH_SECRET.length < minSecretLen) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `JWT_REFRESH_SECRET must be at least ${minSecretLen} characters in ${data.NODE_ENV}`,
        path: ["JWT_REFRESH_SECRET"],
      });
    }
    if (data.NODE_ENV === "production" && data.AUTH_BOOTSTRAP_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTH_BOOTSTRAP_ENABLED must not be true in production",
        path: ["AUTH_BOOTSTRAP_ENABLED"],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  loadDotenv({ path: envFilePath });
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.flatten().fieldErrors;
    const hint =
      "Copy .env.example to .env in the backend folder (or run `npm run env:init` here), then set DATABASE_URL and JWT secrets (16+ characters each in development). " +
      `Loaded env from: ${envFilePath}`;
    throw new Error(`Invalid environment: ${JSON.stringify(message)}\n${hint}`);
  }
  return parsed.data;
}

export const env = loadEnv();
