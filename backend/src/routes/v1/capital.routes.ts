import { Router } from "express";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import { ROLES_READ_ALL } from "../../modules/auth/role-groups.js";
import { capitalController } from "../../modules/capital/capital.controller.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { UserRole } from "@prisma/client";

export const capitalRouter = Router();

const read = [authenticate, requireRoles(...ROLES_READ_ALL)];
const write = [authenticate, requireRoles(UserRole.ADMIN)];

capitalRouter.get("/position", ...read, asyncHandler((req, res) => capitalController.position(req, res)));
capitalRouter.get("/", ...read, asyncHandler((req, res) => capitalController.list(req, res)));
capitalRouter.post("/", ...write, asyncHandler((req, res) => capitalController.create(req, res)));
capitalRouter.post("/opening-cash", ...write, asyncHandler((req, res) => capitalController.setOpeningCash(req, res)));
capitalRouter.patch("/:id", ...write, asyncHandler((req, res) => capitalController.update(req, res)));
capitalRouter.delete("/:id", ...write, asyncHandler((req, res) => capitalController.remove(req, res)));
