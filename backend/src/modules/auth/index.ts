/**
 * Public auth module surface (services + middleware).
 * HTTP routes live under `src/routes/v1/auth.routes.ts`.
 */
export * from "./auth.service.js";
export * from "./auth.types.js";
export * from "./middleware/authenticate.middleware.js";
export * from "./middleware/authorize-roles.middleware.js";
