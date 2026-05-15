# Authentication (Phase 3)

## Folder layout

```text
backend/src/
  modules/auth/
    auth.types.ts              # Public DTOs + token shapes
    auth.validators.ts         # Zod request bodies
    auth.service.ts            # Login, refresh rotation, users, bootstrap
    password.ts                # bcrypt hash / verify
    opaque-token.ts            # Random refresh token + SHA-256 storage
    token.service.ts           # JWT access sign / verify + Bearer parser
    middleware/
      authenticate.middleware.ts   # Bearer → req.auth
      authorize-roles.middleware.ts # RBAC guard factory
    index.ts                   # Barrel exports
  routes/v1/
    auth.routes.ts             # HTTP mapping only
  types/
    express-auth.d.ts          # req.auth augmentation
```

Routes are mounted at **`/api/v1/auth/*`** to match API versioning.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/bootstrap` | No | Creates first **ADMIN** when DB has zero users. Requires `AUTH_BOOTSTRAP_ENABLED=true` (blocked in production by env validation). |
| `POST` | `/api/v1/auth/login` | No | Email + password → access + refresh tokens. |
| `POST` | `/api/v1/auth/refresh` | No | Rotates refresh token; returns new access + refresh. |
| `POST` | `/api/v1/auth/logout` | No | Revokes one refresh token (body). |
| `POST` | `/api/v1/auth/logout-all` | Bearer | Revokes all refresh tokens for the user. |
| `GET` | `/api/v1/auth/me` | Bearer | Current user profile. |
| `POST` | `/api/v1/auth/users` | Bearer **ADMIN** | Creates staff user with role. |

## Tokens

- **Access token:** JWT (HS256), short TTL (`ACCESS_TOKEN_TTL_SECONDS`, default 15 minutes). Payload includes `sub`, `email`, `role`, `typ: "access"`.
- **Refresh token:** opaque random string, **only stored as SHA-256** in `refresh_tokens`. Plain token returned **only** at login/refresh. **Rotation:** each successful refresh revokes the previous DB row and mints a new one (reuse detection / theft limits blast radius).

## RBAC

Roles in Prisma: `ADMIN`, `CASHIER`, `INVENTORY_MANAGER`.

Use middleware composition:

```ts
import { authenticate } from "../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../modules/auth/middleware/authorize-roles.middleware.js";
import { UserRole } from "@prisma/client";

router.post(
  "/example",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.INVENTORY_MANAGER),
  handler,
);
```

## Security practices (implemented / recommended)

1. **Passwords:** bcrypt with configurable cost (`BCRYPT_COST`, default 12).
2. **No user enumeration:** login failures return a generic message (`INVALID_CREDENTIALS`).
3. **Secrets:** `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be distinct; production requires length ≥ 32 (see `config/env.ts`).
4. **Bootstrap:** must never stay enabled in production; env schema rejects `AUTH_BOOTSTRAP_ENABLED=true` when `NODE_ENV=production`.
5. **HTTPS:** always terminate TLS in production; never send tokens over plain HTTP.
6. **Optional hardening (later):** rate-limit `/auth/login` and `/auth/refresh`, device binding, httpOnly+Secure cookies for refresh tokens, IP allowlists for admin.

## Database

After pulling schema changes, run from `backend`:

```bash
npx prisma migrate dev --name phase3_refresh_tokens
```

## Maintenance

`auth.service.purgeExpiredRefreshTokens()` can be scheduled (cron) to delete refresh token rows expired more than 30 days ago and keep the table small.
