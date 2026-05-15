import { Router } from "express";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import {
  ROLES_INVENTORY_WRITE,
  ROLES_READ_ALL,
} from "../../modules/auth/role-groups.js";
import { inventoryController } from "../../modules/inventory/inventory.controller.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const inventoryRouter = Router();

const read = [authenticate, requireRoles(...ROLES_READ_ALL)];
const write = [authenticate, requireRoles(...ROLES_INVENTORY_WRITE)];

inventoryRouter.get(
  "/balances",
  ...read,
  asyncHandler((req, res) => inventoryController.listBalances(req, res)),
);
inventoryRouter.get(
  "/stock-summary",
  ...read,
  asyncHandler((req, res) => inventoryController.stockSummary(req, res)),
);
inventoryRouter.get(
  "/balances/:variantId",
  ...read,
  asyncHandler((req, res) => inventoryController.getBalance(req, res)),
);
inventoryRouter.get(
  "/logs",
  ...read,
  asyncHandler((req, res) => inventoryController.listLogs(req, res)),
);

inventoryRouter.post(
  "/adjustments",
  ...write,
  asyncHandler((req, res) => inventoryController.createAdjustment(req, res)),
);
inventoryRouter.get(
  "/adjustments/:adjustmentId",
  ...read,
  asyncHandler((req, res) => inventoryController.getAdjustment(req, res)),
);

inventoryRouter.post(
  "/returns/:returnId/apply-restock",
  ...write,
  asyncHandler((req, res) => inventoryController.applyReturnRestock(req, res)),
);
