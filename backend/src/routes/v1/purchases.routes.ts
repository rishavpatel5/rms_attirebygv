import { Router } from "express";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import {
  ROLES_PURCHASE_WRITE,
  ROLES_READ_ALL,
} from "../../modules/auth/role-groups.js";
import { purchaseController } from "../../modules/purchases/purchase.controller.js";
import { purchaseReturnController } from "../../modules/purchases/purchase-return.controller.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const purchasesRouter = Router();

const read = [authenticate, requireRoles(...ROLES_READ_ALL)];
const write = [authenticate, requireRoles(...ROLES_PURCHASE_WRITE)];

// Purchase returns (debit notes). Registered before "/:id" so "/returns" isn't captured.
purchasesRouter.post(
  "/returns/preview",
  ...write,
  asyncHandler((req, res) => purchaseReturnController.preview(req, res)),
);
purchasesRouter.post(
  "/returns",
  ...write,
  asyncHandler((req, res) => purchaseReturnController.create(req, res)),
);
purchasesRouter.get(
  "/returns/stock",
  ...read,
  asyncHandler((req, res) => purchaseReturnController.searchStock(req, res)),
);
purchasesRouter.get(
  "/returns",
  ...read,
  asyncHandler((req, res) => purchaseReturnController.list(req, res)),
);
purchasesRouter.get(
  "/returns/:id",
  ...read,
  asyncHandler((req, res) => purchaseReturnController.get(req, res)),
);

purchasesRouter.get(
  "/",
  ...read,
  asyncHandler((req, res) => purchaseController.list(req, res)),
);
purchasesRouter.post(
  "/",
  ...write,
  asyncHandler((req, res) => purchaseController.create(req, res)),
);
purchasesRouter.post(
  "/save-and-receive",
  ...write,
  asyncHandler((req, res) => purchaseController.saveAndReceive(req, res)),
);
purchasesRouter.get(
  "/variant-cost/:variantId",
  ...read,
  asyncHandler((req, res) => purchaseController.variantCost(req, res)),
);
purchasesRouter.get(
  "/:id",
  ...read,
  asyncHandler((req, res) => purchaseController.get(req, res)),
);
purchasesRouter.patch(
  "/:id",
  ...write,
  asyncHandler((req, res) => purchaseController.update(req, res)),
);
purchasesRouter.put(
  "/:id/lines",
  ...write,
  asyncHandler((req, res) => purchaseController.replaceLines(req, res)),
);
purchasesRouter.post(
  "/:id/submit",
  ...write,
  asyncHandler((req, res) => purchaseController.submit(req, res)),
);
purchasesRouter.post(
  "/:id/receive",
  ...write,
  asyncHandler((req, res) => purchaseController.receive(req, res)),
);
purchasesRouter.post(
  "/:id/payments",
  ...write,
  asyncHandler((req, res) => purchaseController.recordPayment(req, res)),
);
