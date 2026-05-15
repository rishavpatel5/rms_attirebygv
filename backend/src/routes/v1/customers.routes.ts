import { Router } from "express";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import {
  ROLES_POS_WRITE,
  ROLES_READ_ALL,
} from "../../modules/auth/role-groups.js";
import { customerController } from "../../modules/customers/customer.controller.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const customersRouter = Router();

const read = [authenticate, requireRoles(...ROLES_READ_ALL)];
const write = [authenticate, requireRoles(...ROLES_POS_WRITE)];

customersRouter.get(
  "/pos-search",
  ...read,
  asyncHandler((req, res) => customerController.posSearch(req, res)),
);

customersRouter.get(
  "/",
  ...read,
  asyncHandler((req, res) => customerController.list(req, res)),
);
customersRouter.post(
  "/",
  ...write,
  asyncHandler((req, res) => customerController.create(req, res)),
);
customersRouter.get(
  "/:id/orders",
  ...read,
  asyncHandler((req, res) => customerController.listOrders(req, res)),
);
customersRouter.get(
  "/:id",
  ...read,
  asyncHandler((req, res) => customerController.get(req, res)),
);
customersRouter.patch(
  "/:id",
  ...write,
  asyncHandler((req, res) => customerController.update(req, res)),
);
