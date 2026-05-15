import type { Request, Response } from "express";
import { getQueryRecord, parseBody } from "../../lib/http-parse.js";
import * as categoryService from "./category.service.js";
import * as imageService from "./product-image.service.js";
import * as productService from "./product.service.js";
import * as variantService from "./variant.service.js";
import {
  createCategoryBodySchema,
  createColorBodySchema,
  createProductBodySchema,
  createProductImageBodySchema,
  createSizeBodySchema,
  createVariantBodySchema,
  reorderImagesBodySchema,
  updateCategoryBodySchema,
  updateProductBodySchema,
  updateProductImageBodySchema,
  updateVariantBodySchema,
} from "./catalog.validators.js";

export const catalogController = {
  async listCategories(req: Request, res: Response): Promise<void> {
    const out = await categoryService.listCategories(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async getCategory(req: Request, res: Response): Promise<void> {
    const row = await categoryService.getCategoryById(req.params.id!);
    res.json({ data: row });
  },

  async createCategory(req: Request, res: Response): Promise<void> {
    const body = parseBody(createCategoryBodySchema, req.body);
    const row = await categoryService.createCategory(body);
    res.status(201).json({ data: row });
  },

  async updateCategory(req: Request, res: Response): Promise<void> {
    const body = parseBody(updateCategoryBodySchema, req.body);
    const row = await categoryService.updateCategory(req.params.id!, body);
    res.json({ data: row });
  },

  async deleteCategory(req: Request, res: Response): Promise<void> {
    await categoryService.deleteCategory(req.params.id!);
    res.status(204).send();
  },

  async listProducts(req: Request, res: Response): Promise<void> {
    const out = await productService.listProducts(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async getProduct(req: Request, res: Response): Promise<void> {
    const row = await productService.getProductById(req.params.productId!);
    res.json({ data: row });
  },

  async createProduct(req: Request, res: Response): Promise<void> {
    const body = parseBody(createProductBodySchema, req.body);
    const row = await productService.createProduct(body);
    res.status(201).json({ data: row });
  },

  async updateProduct(req: Request, res: Response): Promise<void> {
    const body = parseBody(updateProductBodySchema, req.body);
    const row = await productService.updateProduct(req.params.productId!, body);
    res.json({ data: row });
  },

  async deleteProduct(req: Request, res: Response): Promise<void> {
    await productService.deleteProduct(req.params.productId!);
    res.status(204).send();
  },

  async listVariants(req: Request, res: Response): Promise<void> {
    const out = await variantService.listVariantsForProduct(
      req.params.productId!,
      getQueryRecord(req),
    );
    res.json({ data: out.items, meta: out.meta });
  },

  async createVariant(req: Request, res: Response): Promise<void> {
    const body = parseBody(createVariantBodySchema, req.body);
    const row = await variantService.createVariant({
      productId: req.params.productId!,
      ...body,
    });
    res.status(201).json({ data: row });
  },

  async getVariant(req: Request, res: Response): Promise<void> {
    const row = await variantService.getVariantById(req.params.variantId!);
    res.json({ data: row });
  },

  async updateVariant(req: Request, res: Response): Promise<void> {
    const body = parseBody(updateVariantBodySchema, req.body);
    const row = await variantService.updateVariant(req.params.variantId!, body);
    res.json({ data: row });
  },

  async deleteVariant(req: Request, res: Response): Promise<void> {
    await variantService.deleteVariant(req.params.variantId!);
    res.status(204).send();
  },

  async listImages(req: Request, res: Response): Promise<void> {
    const rows = await imageService.listImages(req.params.productId!);
    res.json({ data: rows });
  },

  async addImage(req: Request, res: Response): Promise<void> {
    const body = parseBody(createProductImageBodySchema, req.body);
    const row = await imageService.addImage({
      productId: req.params.productId!,
      ...body,
    });
    res.status(201).json({ data: row });
  },

  async updateImage(req: Request, res: Response): Promise<void> {
    const body = parseBody(updateProductImageBodySchema, req.body);
    const row = await imageService.updateImage(req.params.imageId!, body);
    res.json({ data: row });
  },

  async reorderImages(req: Request, res: Response): Promise<void> {
    const body = parseBody(reorderImagesBodySchema, req.body);
    await imageService.reorderImages(req.params.productId!, body.orderedIds);
    res.status(204).send();
  },

  async deleteImage(req: Request, res: Response): Promise<void> {
    await imageService.deleteImage(req.params.imageId!);
    res.status(204).send();
  },

  async listColors(req: Request, res: Response): Promise<void> {
    const out = await productService.listColors(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async createColor(req: Request, res: Response): Promise<void> {
    const body = parseBody(createColorBodySchema, req.body);
    const row = await productService.createColor(body);
    res.status(201).json({ data: row });
  },

  async listSizes(req: Request, res: Response): Promise<void> {
    const out = await productService.listSizes(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async createSize(req: Request, res: Response): Promise<void> {
    const body = parseBody(createSizeBodySchema, req.body);
    const row = await productService.createSize(body);
    res.status(201).json({ data: row });
  },
};
