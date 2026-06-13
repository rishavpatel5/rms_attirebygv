import { Router } from "express";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import { ROLES_READ_ALL } from "../../modules/auth/role-groups.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { analyticsController } from "../../modules/analytics/analytics.controller.js";

export const analyticsRouter = Router();

const read = [authenticate, requireRoles(...ROLES_READ_ALL)];

analyticsRouter.get(
  "/sales-series",
  ...read,
  asyncHandler((req, res) => analyticsController.salesSeries(req, res)),
);

analyticsRouter.get(
  "/profit/summary",
  ...read,
  asyncHandler((req, res) => analyticsController.profitSummary(req, res)),
);

analyticsRouter.get(
  "/profit/lines",
  ...read,
  asyncHandler((req, res) => analyticsController.profitLines(req, res)),
);

analyticsRouter.get(
  "/inventory-valuation",
  ...read,
  asyncHandler((req, res) => analyticsController.inventoryValuation(req, res)),
);

analyticsRouter.get(
  "/fast-moving",
  ...read,
  asyncHandler((req, res) => analyticsController.fastMoving(req, res)),
);

analyticsRouter.get(
  "/dead-stock",
  ...read,
  asyncHandler((req, res) => analyticsController.deadStock(req, res)),
);

analyticsRouter.get(
  "/customer-retention",
  ...read,
  asyncHandler((req, res) => analyticsController.customerRetention(req, res)),
);

analyticsRouter.get(
  "/offer-performance",
  ...read,
  asyncHandler((req, res) => analyticsController.offerPerformance(req, res)),
);

analyticsRouter.get(
  "/orders",
  ...read,
  asyncHandler((req, res) => analyticsController.ordersReport(req, res)),
);

analyticsRouter.get(
  "/purchase-analysis",
  ...read,
  asyncHandler((req, res) => analyticsController.purchaseAnalysis(req, res)),
);
