import { Router } from "express";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import { ROLES_READ_ALL } from "../../modules/auth/role-groups.js";
import { offerController } from "../../modules/offers/offer.controller.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const offersRouter = Router();

offersRouter.get(
  "/",
  authenticate,
  requireRoles(...ROLES_READ_ALL),
  asyncHandler((req, res) => offerController.list(req, res)),
);
