import { Router } from "express";
import { authenticate } from "../../modules/auth/middleware/authenticate.middleware.js";
import { requireRoles } from "../../modules/auth/middleware/authorize-roles.middleware.js";
import {
  ROLES_CATALOG_WRITE,
  ROLES_READ_ALL,
} from "../../modules/auth/role-groups.js";
import { catalogController } from "../../modules/catalog/catalog.controller.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const catalogRouter = Router();

const read = [authenticate, requireRoles(...ROLES_READ_ALL)];
const write = [authenticate, requireRoles(...ROLES_CATALOG_WRITE)];

catalogRouter.get(
  "/categories",
  ...read,
  asyncHandler((req, res) => catalogController.listCategories(req, res)),
);
catalogRouter.get(
  "/categories/:id",
  ...read,
  asyncHandler((req, res) => catalogController.getCategory(req, res)),
);
catalogRouter.post(
  "/categories",
  ...write,
  asyncHandler((req, res) => catalogController.createCategory(req, res)),
);
catalogRouter.patch(
  "/categories/:id",
  ...write,
  asyncHandler((req, res) => catalogController.updateCategory(req, res)),
);
catalogRouter.delete(
  "/categories/:id",
  ...write,
  asyncHandler((req, res) => catalogController.deleteCategory(req, res)),
);

catalogRouter.get(
  "/products",
  ...read,
  asyncHandler((req, res) => catalogController.listProducts(req, res)),
);
catalogRouter.post(
  "/products",
  ...write,
  asyncHandler((req, res) => catalogController.createProduct(req, res)),
);
catalogRouter.get(
  "/products/:productId",
  ...read,
  asyncHandler((req, res) => catalogController.getProduct(req, res)),
);
catalogRouter.patch(
  "/products/:productId",
  ...write,
  asyncHandler((req, res) => catalogController.updateProduct(req, res)),
);
catalogRouter.delete(
  "/products/:productId",
  ...write,
  asyncHandler((req, res) => catalogController.deleteProduct(req, res)),
);

catalogRouter.get(
  "/products/:productId/variants",
  ...read,
  asyncHandler((req, res) => catalogController.listVariants(req, res)),
);
catalogRouter.post(
  "/products/:productId/variants",
  ...write,
  asyncHandler((req, res) => catalogController.createVariant(req, res)),
);

catalogRouter.get(
  "/variants/:variantId",
  ...read,
  asyncHandler((req, res) => catalogController.getVariant(req, res)),
);
catalogRouter.patch(
  "/variants/:variantId",
  ...write,
  asyncHandler((req, res) => catalogController.updateVariant(req, res)),
);
catalogRouter.delete(
  "/variants/:variantId",
  ...write,
  asyncHandler((req, res) => catalogController.deleteVariant(req, res)),
);

catalogRouter.get(
  "/reference/colors",
  ...read,
  asyncHandler((req, res) => catalogController.listColors(req, res)),
);
catalogRouter.post(
  "/reference/colors",
  ...write,
  asyncHandler((req, res) => catalogController.createColor(req, res)),
);
catalogRouter.get(
  "/reference/sizes",
  ...read,
  asyncHandler((req, res) => catalogController.listSizes(req, res)),
);
catalogRouter.post(
  "/reference/sizes",
  ...write,
  asyncHandler((req, res) => catalogController.createSize(req, res)),
);
