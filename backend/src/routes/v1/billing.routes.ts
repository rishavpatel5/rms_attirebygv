import { Router } from "express";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import { ROLES_POS_WRITE, ROLES_READ_ALL } from "../../modules/auth/role-groups.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { billingController } from "../../modules/billing/billing.controller.js";

export const billingRouter = Router();

const read = [authenticate, requireRoles(...ROLES_READ_ALL)];
const write = [authenticate, requireRoles(...ROLES_POS_WRITE)];

billingRouter.get(
  "/pos/search",
  ...read,
  asyncHandler((req, res) => billingController.posSearch(req, res)),
);

billingRouter.post(
  "/quote",
  ...read,
  asyncHandler((req, res) => billingController.quote(req, res)),
);

billingRouter.post(
  "/checkout",
  ...write,
  asyncHandler((req, res) => billingController.checkout(req, res)),
);

billingRouter.post(
  "/orders/draft",
  ...write,
  asyncHandler((req, res) => billingController.createDraft(req, res)),
);

billingRouter.post(
  "/orders/:orderId/confirm",
  ...write,
  asyncHandler((req, res) => billingController.confirmOrder(req, res)),
);

billingRouter.get(
  "/orders/:orderId/invoice",
  ...read,
  asyncHandler((req, res) => billingController.getInvoice(req, res)),
);

billingRouter.get(
  "/orders",
  ...read,
  asyncHandler((req, res) => billingController.listOrders(req, res)),
);

billingRouter.post(
  "/credit-notes",
  ...write,
  asyncHandler((req, res) => billingController.createCreditNote(req, res)),
);

billingRouter.post(
  "/exchanges",
  ...write,
  asyncHandler((req, res) => billingController.createExchange(req, res)),
);

billingRouter.delete(
  "/orders/:orderId",
  ...write,
  asyncHandler((req, res) => billingController.voidSale(req, res)),
);
