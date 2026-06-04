import type { Express } from "express";
import { publicInvoiceRouter } from "./public-invoice.routes.js";
import { v1Router } from "./v1/index.js";

export function registerRoutes(app: Express): void {
  app.use("/i", publicInvoiceRouter);
  app.use("/api/v1", v1Router);
}
