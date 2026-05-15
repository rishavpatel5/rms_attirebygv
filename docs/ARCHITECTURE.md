# Full-stack architecture (foundation)

Monorepo layout optimized for a **single Node API** and a **static React SPA** — suitable for Hostinger Business (Node + static) or split hosting.

## Folder structure

```text
.
├── backend                          # Express + Prisma + PostgreSQL
│   ├── prisma
│   │   └── schema.prisma            # Phase 2: domain models + migrations
│   ├── src
│   │   ├── index.ts                 # HTTP server bootstrap + graceful shutdown
│   │   ├── app.ts                   # Express app factory (middleware + routes)
│   │   ├── config
│   │   │   └── env.ts               # Zod-validated environment
│   │   ├── lib
│   │   │   ├── prisma.ts            # Singleton PrismaClient
│   │   │   └── logger.ts            # Pino logger
│   │   ├── middleware
│   │   │   ├── error-handler.ts
│   │   │   ├── not-found.ts
│   │   │   └── request-id.ts
│   │   ├── routes
│   │   │   ├── register-routes.ts
│   │   │   └── v1                   # Versioned HTTP surface
│   │   │       ├── index.ts
│   │   │       ├── auth.routes.ts
│   │   │       └── health.routes.ts
│   │   ├── modules
│   │   │   └── auth/                # JWT + refresh + RBAC middleware
│   │   ├── services                 # Domain services (empty until later phases)
│   │   ├── repositories             # Data access (empty)
│   │   ├── validators               # Zod schemas (empty)
│   │   ├── types
│   │   │   ├── api.ts               # Shared API envelope types
│   │   │   └── express-auth.d.ts
│   │   └── utils
│   │       └── async-handler.ts     # Async route wrapper → Express error middleware
│   ├── package.json
│   └── tsconfig*.json
├── frontend                         # Vite + React + Tailwind + shadcn-style UI
│   ├── public
│   ├── src
│   │   ├── main.tsx
│   │   ├── App.tsx                  # Router root
│   │   ├── index.css                # Tailwind + CSS variables (shadcn theme)
│   │   ├── components
│   │   │   ├── layout               # Dashboard shell, sidebar, top bar
│   │   │   ├── dashboard            # KPIs, charts, tables
│   │   │   ├── billing              # POS workspace
│   │   │   └── ui                   # shadcn primitives
│   │   ├── pages                    # Route-level pages
│   │   ├── lib
│   │   │   ├── api-client.ts        # JSON fetch + `{ data }` unwrap
│   │   │   ├── api-types.ts
│   │   │   └── utils.ts             # `cn()` helper
│   │   ├── providers                # Theme, auth provider (auth later)
│   │   ├── stores                   # Zustand (theme, UI, billing)
│   │   └── hooks
│   ├── components.json              # shadcn/ui generator config
│   ├── tailwind.config.ts
│   ├── vite.config.ts               # `@/` alias + `/api` dev proxy
│   └── package.json
├── docs
│   ├── ARCHITECTURE.md              # This file
│   └── CONVENTIONS.md               # Naming + REST conventions
├── package.json                     # npm workspaces + root scripts
└── README.md
```

**Later phases:** add `frontend/src/features/<domain>/` and `backend/src/routes/v1/<domain>.routes.ts` + matching `services/` — not present yet by design.

## Backend architecture

- **Entry:** `index.ts` loads env, creates app, listens, handles `SIGINT`/`SIGTERM`, disconnects Prisma.
- **App:** security + observability middleware first (`helmet`, `compression`, `cors`, JSON body), then versioned routes, then 404 + centralized error handler.
- **Versioning:** all REST handlers live under `routes/v1/` and are mounted at `/api/v1`. Future breaking changes = `routes/v2/`.
- **Patterns:** `asyncHandler` for async routes; throw `AppError` for controlled 4xx; unknown errors → 500 with safe message in production.
- **Data:** Prisma is the only DB access layer; migrations live in `backend/prisma/migrations`.

## Frontend architecture

- **Routing:** `react-router-dom` with a layout route (`DashboardShell`) and nested pages.
- **Styling:** Tailwind + CSS variables aligned with shadcn’s `new-york` / `zinc` token set; `components/ui/*` holds reusable primitives (`npx shadcn@latest add …` adds more).
- **Data:** `api-client.ts` is the single place for JSON conventions; in dev, relative `/api/...` hits Vite’s proxy to Express.

## Dependency list (high level)

**Root**

- `concurrently` — run API + web together in development.

**`backend`** (`@rms/api`)

- `express`, `cors`, `helmet`, `compression` — HTTP server and cross-cutting middleware.
- `pino` — structured application/request logging (custom `httpLogger` middleware).
- `dotenv` — load `.env` in development.
- `zod` — validate `process.env` at startup.
- `@prisma/client`, `prisma` — ORM + CLI.
- `jsonwebtoken`, `bcrypt` — access JWTs and password hashing.

**`frontend`** (`@rms/web`)

- `react`, `react-dom`, `react-router-dom` — UI and routing.
- `vite`, `@vitejs/plugin-react`, `typescript` — toolchain.
- `tailwindcss`, `postcss`, `autoprefixer` — styling pipeline.
- `class-variance-authority`, `clsx`, `tailwind-merge` — variant styling + `cn()`.
- `@radix-ui/react-slot` — shadcn `Button` composition.
- `lucide-react` — icons (shadcn default).

## Hostinger-friendly notes

- One **long-running** Node process for the API; keep WebSockets/Redis out until needed (per product requirements).
- Run **`prisma migrate deploy`** in deploy pipeline or post-install hook — not `migrate dev`.
- Serve the SPA **static files** from `frontend/dist` via the same domain (reverse proxy `/api` → Node) or a subdomain — avoid CORS complexity in production when possible.

## Reusable patterns (summary)

| Pattern | Where |
|--------|--------|
| API success envelope `{ data, meta? }` | `backend/src/types/api.ts` + route handlers |
| API error envelope `{ error: { code, message, details? } }` | `AppError` + `error-handler` |
| Request correlation ID | `x-request-id` middleware |
| Async route safety | `asyncHandler` |
| Typed env | `config/env.ts` (Zod) |
| Protect routes | `authenticate` + `requireRoles(...)` from `modules/auth/middleware` |
| JSON GET helper | `frontend/src/lib/api-client.ts` |
| UI variants | `cva` + `Button` in `components/ui` |

See [`CONVENTIONS.md`](./CONVENTIONS.md) for naming and REST rules.
