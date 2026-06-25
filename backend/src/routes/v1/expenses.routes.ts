import { Router } from "express";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import { ROLES_READ_ALL } from "../../modules/auth/role-groups.js";
import { expenseController } from "../../modules/expenses/expense.controller.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { UserRole } from "@prisma/client";

export const expensesRouter = Router();

const read = [authenticate, requireRoles(...ROLES_READ_ALL)];
const write = [authenticate, requireRoles(UserRole.ADMIN)];

expensesRouter.get("/", ...read, asyncHandler((req, res) => expenseController.list(req, res)));
expensesRouter.get("/summary", ...read, asyncHandler((req, res) => expenseController.summary(req, res)));
expensesRouter.post("/", ...write, asyncHandler((req, res) => expenseController.create(req, res)));
expensesRouter.patch("/:id", ...write, asyncHandler((req, res) => expenseController.update(req, res)));
expensesRouter.delete("/:id", ...write, asyncHandler((req, res) => expenseController.remove(req, res)));
