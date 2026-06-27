import { GstPricingMode, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { buildMeta, parsePagination } from "../../lib/pagination.js";
import { defaultIntraStateGstPercentages } from "../../lib/gst-defaults.js";

export async function listVariantsForProduct(
  productId: string,
  query: Record<string, unknown>,
) {
  const { page, limit, skip } = parsePagination(query);
  const isActive =
    query.isActive === "false" ? false : query.isActive === "true" ? true : true;
  const skuSearch =
    typeof query.search === "string" && query.search.trim().length > 0
      ? query.search.trim()
      : undefined;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }

  const where = {
    productId,
    ...(isActive === undefined ? {} : { isActive }),
    ...(skuSearch
      ? { sku: { contains: skuSearch, mode: "insensitive" as const } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      skip,
      take: limit,
      orderBy: { sku: "asc" },
      include: {
        color: true,
        size: true,
        inventory: true,
      },
    }),
    prisma.productVariant.count({ where }),
  ]);

  return { items, meta: buildMeta(page, limit, total) };
}

export async function getVariantById(id: string) {
  const row = await prisma.productVariant.findUnique({
    where: { id },
    include: {
      product: true,
      color: true,
      size: true,
      inventory: true,
    },
  });
  if (!row) {
    throw new AppError(404, "VARIANT_NOT_FOUND", "Variant not found");
  }
  return row;
}

export async function createVariant(input: {
  productId: string;
  sku: string;
  listPrice?: number;
  costPrice?: number | null;
  gstEnabled?: boolean;
  gstPricingMode?: GstPricingMode;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  lowStockThreshold?: number | null;
  colorId?: string | null;
  sizeId?: string | null;
}) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
  });
  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  if (input.colorId) {
    const c = await prisma.color.findUnique({ where: { id: input.colorId } });
    if (!c) throw new AppError(404, "COLOR_NOT_FOUND", "Color not found");
  }
  if (input.sizeId) {
    const s = await prisma.size.findUnique({ where: { id: input.sizeId } });
    if (!s) throw new AppError(404, "SIZE_NOT_FOUND", "Size not found");
  }

  const sku = input.sku.trim();
  if (sku.length < 2 || sku.length > 64) {
    throw new AppError(400, "INVALID_SKU", "Invalid SKU length");
  }

  // If an inactive (soft-deleted) variant is squatting on this SKU, free it first
  const squatter = await prisma.productVariant.findUnique({ where: { sku }, select: { id: true, isActive: true } });
  if (squatter && !squatter.isActive) {
    await prisma.productVariant.update({
      where: { id: squatter.id },
      data: { sku: `${sku}__deleted_${squatter.id.slice(-8)}` },
    });
  }

  const rateDefaults = defaultIntraStateGstPercentages(product.kind);
  const cgst = input.cgstRate ?? rateDefaults.cgst;
  const sgst = input.sgstRate ?? rateDefaults.sgst;
  const igst = input.igstRate ?? rateDefaults.igst;

  return prisma.$transaction(async (tx) => {
    try {
      const v = await tx.productVariant.create({
        data: {
          productId: input.productId,
          sku,
          listPrice: new Prisma.Decimal(input.listPrice ?? 0),
          costPrice:
            input.costPrice != null && input.costPrice !== undefined
              ? new Prisma.Decimal(input.costPrice)
              : null,
          gstEnabled: input.gstEnabled ?? true,
          gstPricingMode: input.gstPricingMode ?? GstPricingMode.INCLUSIVE,
          cgstRate: new Prisma.Decimal(cgst),
          sgstRate: new Prisma.Decimal(sgst),
          igstRate: new Prisma.Decimal(igst),
          lowStockThreshold: input.lowStockThreshold ?? null,
          colorId: input.colorId ?? null,
          sizeId: input.sizeId ?? null,
        },
      });
      await tx.inventoryBalance.create({
        data: { variantId: v.id, quantity: 0 },
      });
      return tx.productVariant.findUniqueOrThrow({
        where: { id: v.id },
        include: { color: true, size: true, inventory: true },
      });
    } catch (e: unknown) {
      const code =
        typeof e === "object" && e !== null && "code" in e
          ? String((e as { code?: string }).code)
          : "";
      if (code === "P2002") {
        throw new AppError(409, "SKU_IN_USE", "SKU already exists");
      }
      throw e;
    }
  });
}

export async function updateVariant(
  id: string,
  input: {
    sku?: string;
    listPrice?: number;
    costPrice?: number | null;
    gstEnabled?: boolean;
    gstPricingMode?: GstPricingMode;
    cgstRate?: number;
    sgstRate?: number;
    igstRate?: number;
    lowStockThreshold?: number | null;
    colorId?: string | null;
    sizeId?: string | null;
    isActive?: boolean;
  },
) {
  if (input.colorId) {
    const c = await prisma.color.findUnique({ where: { id: input.colorId } });
    if (!c) throw new AppError(404, "COLOR_NOT_FOUND", "Color not found");
  }
  if (input.sizeId) {
    const s = await prisma.size.findUnique({ where: { id: input.sizeId } });
    if (!s) throw new AppError(404, "SIZE_NOT_FOUND", "Size not found");
  }
  try {
    return await prisma.productVariant.update({
      where: { id },
      data: {
        ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
        ...(input.listPrice !== undefined
          ? { listPrice: new Prisma.Decimal(input.listPrice) }
          : {}),
        ...(input.costPrice !== undefined
          ? {
              costPrice:
                input.costPrice === null
                  ? null
                  : new Prisma.Decimal(input.costPrice),
            }
          : {}),
        ...(input.gstEnabled !== undefined ? { gstEnabled: input.gstEnabled } : {}),
        ...(input.gstPricingMode !== undefined
          ? { gstPricingMode: input.gstPricingMode }
          : {}),
        ...(input.cgstRate !== undefined
          ? { cgstRate: new Prisma.Decimal(input.cgstRate) }
          : {}),
        ...(input.sgstRate !== undefined
          ? { sgstRate: new Prisma.Decimal(input.sgstRate) }
          : {}),
        ...(input.igstRate !== undefined
          ? { igstRate: new Prisma.Decimal(input.igstRate) }
          : {}),
        ...(input.lowStockThreshold !== undefined
          ? { lowStockThreshold: input.lowStockThreshold }
          : {}),
        ...(input.colorId !== undefined ? { colorId: input.colorId } : {}),
        ...(input.sizeId !== undefined ? { sizeId: input.sizeId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { color: true, size: true, inventory: true },
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2025") {
      throw new AppError(404, "VARIANT_NOT_FOUND", "Variant not found");
    }
    if (code === "P2002") {
      throw new AppError(409, "SKU_IN_USE", "SKU already exists");
    }
    throw e;
  }
}

export async function deleteVariant(id: string): Promise<void> {
  const v = await prisma.productVariant.findUnique({
    where: { id },
    include: { inventory: true, _count: { select: { orderItems: true } } },
  });
  if (!v) {
    throw new AppError(404, "VARIANT_NOT_FOUND", "Variant not found");
  }
  if ((v.inventory?.quantity ?? 0) > 0) {
    throw new AppError(
      409,
      "VARIANT_HAS_STOCK",
      "Cannot delete variant with positive on-hand quantity",
    );
  }
  if (v._count.orderItems > 0) {
    // Soft-delete: mangle the SKU so the original is free for re-creation
    await prisma.productVariant.update({
      where: { id },
      data: { isActive: false, sku: `${v.sku}__deleted_${id.slice(-8)}` },
    });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.inventoryBalance.deleteMany({ where: { variantId: id } });
    await tx.productVariant.delete({ where: { id } });
  });
}

const skuLookupInclude = {
  product: {
    select: {
      id: true,
      name: true,
      kind: true,
      brand: true,
      category: { select: { name: true } },
    },
  },
  color: { select: { name: true } },
  size: { select: { label: true } },
  inventory: { select: { quantity: true } },
} as const;

/** Live catalog search by product name OR SKU (for the catalog search bar). */
export async function lookupVariantsBySku(query: Record<string, unknown>) {
  const raw =
    typeof query.sku === "string"
      ? query.sku
      : typeof query.q === "string"
        ? query.q
        : "";
  const q = raw.trim();
  if (!q || q.length < 2) {
    throw new AppError(400, "QUERY_REQUIRED", "Enter at least 2 characters to search");
  }

  // Token search: each whitespace-separated word must match somewhere
  // (name / SKU / color / size / category / brand). This makes "camo flex"
  // match "Camoflex" (both tokens are substrings) and "baggy black" match a
  // Baggy product whose SKU contains "Black".
  const tokens = q.split(/\s+/).filter(Boolean);
  const matches = await prisma.productVariant.findMany({
    where: {
      isActive: true,
      AND: tokens.map((tok) => ({
        OR: [
          { sku: { contains: tok, mode: "insensitive" as const } },
          { product: { name: { contains: tok, mode: "insensitive" as const } } },
          { product: { brand: { contains: tok, mode: "insensitive" as const } } },
          { product: { category: { name: { contains: tok, mode: "insensitive" as const } } } },
          { color: { name: { contains: tok, mode: "insensitive" as const } } },
          { size: { label: { contains: tok, mode: "insensitive" as const } } },
        ],
      })),
    },
    take: 50,
    orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    include: skuLookupInclude,
  });

  const exactMatch = matches.find((m) => m.sku.toLowerCase() === q.toLowerCase()) ?? null;

  return {
    query: q,
    exists: matches.length > 0,
    exactMatch,
    matches,
  };
}
