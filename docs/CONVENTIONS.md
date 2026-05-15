# RMS — architecture conventions

This document defines cross-cutting rules for the API, web app, and database. **Domain feature modules** (products, inventory, billing, etc.) are added in later phases; only foundation patterns live here.

## Naming

| Area | Convention | Example |
|------|------------|---------|
| Database tables | `snake_case`, plural | `order_items`, `inventory_logs` |
| Database columns | `snake_case` | `created_at`, `variant_id` |
| Prisma models | `PascalCase`, singular | `OrderItem`, `InventoryLog` |
| Prisma fields | `camelCase` in schema; map with `@map` to DB | `createdAt` → `created_at` |
| API JSON | `camelCase` | `orderId`, `lineItems` |
| REST path segments | `kebab-case` plural resources | `/api/v1/order-items` |
| Route files | `*.routes.ts` | `health.routes.ts` |
| TypeScript files | `kebab-case` | `error-handler.ts`, `async-handler.ts` |
| React components | `PascalCase.tsx` | `ThemeToggle.tsx` |
| React hooks | `useThing.ts` | `useTheme.ts` |
| Env vars | `SCREAMING_SNAKE_CASE` | `DATABASE_URL`, `JWT_SECRET` |

## API versioning

- All HTTP APIs are under **`/api/v1`**.
- Breaking changes ship as **`/api/v2`** (new router); v1 remains until consumers migrate.

## REST & HTTP

- **Success:** `2xx` with JSON body `{ "data": T }` or `{ "data": T, "meta": { ... } }` for pagination.
- **Error:** JSON `{ "error": { "code": string, "message": string, "details?"?: unknown } }`.
- **Pagination (list endpoints):** query `page` (1-based), `limit` (max capped server-side), response `meta: { page, limit, total }` or cursor-based later; pick one project-wide when list endpoints multiply.
- **Idempotency (mutations like checkout):** header `Idempotency-Key` (documented per endpoint when introduced).

## Layering (API)

1. **Route** — HTTP only: parse params/body, call service, map to HTTP status.
2. **Service** — business rules and orchestration (transactions live here or in a dedicated unit-of-work helper).
3. **Repository** — Prisma queries only (no business rules); optional for small handlers but required for complex domains later.

Do not put Prisma calls directly in route files once domain logic exists; foundation routes (`/health`) may inline trivial checks.

## Frontend

- **Feature folders** (`src/features/*`) hold domain UI when phases begin; until then, only shared shell and `components/ui` live here.
- **API calls** — centralize in `src/lib/api-client.ts` with typed helpers; no raw `fetch` scattered across components for authenticated routes.
- **URL state** — prefer React Router; table filters may use search params for shareable URLs.

## Environment

- **Never** commit secrets. Use `.env.example` per app as the contract.
- **Production (e.g. Hostinger):** set env vars in the panel or process manager; run `prisma migrate deploy` before or on startup.
