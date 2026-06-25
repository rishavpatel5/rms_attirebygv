import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import { ROLES_PURCHASE_WRITE } from "../../modules/auth/role-groups.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { handleScan, handleCommit, handleListBatches, handleRollback } from "../../modules/bulk-import/bulk-import.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok =
      file.originalname.toLowerCase().endsWith(".xlsx") ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    cb(null, ok);
  },
});

const write = [authenticate, requireRoles(...ROLES_PURCHASE_WRITE)];

export const bulkImportRouter = Router();

bulkImportRouter.post("/scan", ...write, upload.single("file"), asyncHandler(handleScan));
bulkImportRouter.post("/commit", ...write, asyncHandler(handleCommit));
bulkImportRouter.get("/batches", ...write, asyncHandler(handleListBatches));
bulkImportRouter.post("/batches/:id/rollback", ...write, asyncHandler(handleRollback));
