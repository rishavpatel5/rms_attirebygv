import { GstPricingMode, ProductGender, ProductKind } from "@prisma/client";
import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format");

export const createCategoryBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional().nullable(),
  parentId: z.string().cuid().optional().nullable(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

export const updateCategoryBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  parentId: z.string().cuid().optional().nullable(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
});

export const createProductBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  brand: z.string().trim().max(120).optional().nullable(),
  kind: z.nativeEnum(ProductKind),
  gender: z.nativeEnum(ProductGender),
  categoryId: z.string().cuid(),
});

export const updateProductBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  brand: z.string().trim().max(120).optional().nullable(),
  kind: z.nativeEnum(ProductKind).optional(),
  gender: z.nativeEnum(ProductGender).optional(),
  categoryId: z.string().cuid().optional(),
  isActive: z.boolean().optional(),
});

export const createVariantBodySchema = z.object({
  sku: z.string().trim().min(2).max(64),
  listPrice: z.coerce.number().finite().min(0).max(1_000_000).optional().default(0),
  costPrice: z.coerce.number().finite().min(0).max(1_000_000).optional().nullable(),
  gstEnabled: z.boolean().optional(),
  gstPricingMode: z.nativeEnum(GstPricingMode).optional(),
  cgstRate: z.coerce.number().finite().min(0).max(100).optional(),
  sgstRate: z.coerce.number().finite().min(0).max(100).optional(),
  igstRate: z.coerce.number().finite().min(0).max(100).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  colorId: z.string().cuid().optional().nullable(),
  sizeId: z.string().cuid().optional().nullable(),
});

export const updateVariantBodySchema = z.object({
  sku: z.string().trim().min(2).max(64).optional(),
  listPrice: z.coerce.number().finite().min(0).max(1_000_000).optional(),
  costPrice: z.coerce.number().finite().min(0).max(1_000_000).optional().nullable(),
  gstEnabled: z.boolean().optional(),
  gstPricingMode: z.nativeEnum(GstPricingMode).optional(),
  cgstRate: z.coerce.number().finite().min(0).max(100).optional(),
  sgstRate: z.coerce.number().finite().min(0).max(100).optional(),
  igstRate: z.coerce.number().finite().min(0).max(100).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  colorId: z.string().cuid().optional().nullable(),
  sizeId: z.string().cuid().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const createColorBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  hexCode: z.string().trim().max(16).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

export const createSizeBodySchema = z.object({
  label: z.string().trim().min(1).max(50),
  code: z.string().trim().min(1).max(32),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});
