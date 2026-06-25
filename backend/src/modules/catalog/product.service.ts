import type { ProductGender, ProductKind, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { buildMeta, parsePagination } from "../../lib/pagination.js";
import { isValidSlug, slugify } from "../../lib/slug.js";

export async function listProducts(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const categoryId =
    typeof query.categoryId === "string" && query.categoryId.length > 0
      ? query.categoryId
      : undefined;
  const kind = query.kind as ProductKind | undefined;
  const gender = query.gender as ProductGender | undefined;
  const isActive =
    query.isActive === "false" ? false : query.isActive === "true" ? true : true;
  const search =
    typeof query.search === "string" && query.search.trim().length > 0
      ? query.search.trim()
      : undefined;

  const where: Prisma.ProductWhereInput = {
    ...(categoryId ? { categoryId } : {}),
    ...(kind ? { kind } : {}),
    ...(gender ? { gender } : {}),
    isActive,
    variants: { some: { isActive: true } },
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { brand: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ updatedAt: "desc" }],
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { variants: { where: { isActive: true } } } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { items, meta: buildMeta(page, limit, total) };
}

export async function getProductById(id: string) {
  const row = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      variants: {
        orderBy: { sku: "asc" },
        include: {
          color: true,
          size: true,
          inventory: true,
        },
      },
    },
  });
  if (!row) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  return row;
}

export async function createProduct(input: {
  name: string;
  slug?: string;
  brand?: string | null;
  kind: ProductKind;
  gender: ProductGender;
  categoryId: string;
}) {
  const slug = (input.slug?.trim() || slugify(input.name)).toLowerCase();
  if (!isValidSlug(slug)) {
    throw new AppError(400, "INVALID_SLUG", "Invalid slug format");
  }
  const cat = await prisma.category.findUnique({
    where: { id: input.categoryId },
  });
  if (!cat) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
  }
  // If an inactive (soft-deleted) product is squatting on this slug, free it first
  const squatter = await prisma.product.findUnique({ where: { slug }, select: { id: true, isActive: true } });
  if (squatter && !squatter.isActive) {
    await prisma.product.update({
      where: { id: squatter.id },
      data: { slug: `${slug}__deleted_${squatter.id.slice(-8)}` },
    });
  }

  try {
    return await prisma.product.create({
      data: {
        name: input.name.trim(),
        slug,
        brand: input.brand?.trim() || null,
        kind: input.kind,
        gender: input.gender,
        categoryId: input.categoryId,
      },
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2002") {
      throw new AppError(409, "SLUG_IN_USE", "Product slug already exists");
    }
    throw e;
  }
}

export async function updateProduct(
  id: string,
  input: {
    name?: string;
    slug?: string;
    brand?: string | null;
    kind?: ProductKind;
    gender?: ProductGender;
    categoryId?: string;
    isActive?: boolean;
  },
) {
  if (input.slug !== undefined && !isValidSlug(input.slug)) {
    throw new AppError(400, "INVALID_SLUG", "Invalid slug format");
  }
  if (input.categoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: input.categoryId },
    });
    if (!cat) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
  }
  try {
    return await prisma.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.slug !== undefined
          ? { slug: input.slug.trim().toLowerCase() }
          : {}),
        ...(input.brand !== undefined
          ? { brand: input.brand?.trim() || null }
          : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2025") {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
    if (code === "P2002") {
      throw new AppError(409, "SLUG_IN_USE", "Product slug already exists");
    }
    throw e;
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const stocked = await prisma.inventoryBalance.count({
    where: { variant: { productId: id }, quantity: { gt: 0 } },
  });
  if (stocked > 0) {
    throw new AppError(
      409,
      "PRODUCT_HAS_STOCK",
      "Cannot delete product while variants have on-hand quantity",
    );
  }
  const orderLines = await prisma.orderItem.count({
    where: { variant: { productId: id } },
  });
  if (orderLines > 0) {
    // Soft-delete: mangle slug so the original name/slug is free for re-creation
    const existing = await prisma.product.findUnique({ where: { id }, select: { slug: true } });
    await prisma.product.update({
      where: { id },
      data: { isActive: false, slug: `${existing?.slug ?? id}__deleted_${id.slice(-8)}` },
    });
    return;
  }
  try {
    await prisma.product.delete({ where: { id } });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2025") {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
    throw e;
  }
}

export async function listColors(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const isActive =
    query.isActive === "false" ? false : query.isActive === "true" ? true : undefined;
  const search =
    typeof query.search === "string" && query.search.trim().length > 0
      ? query.search.trim()
      : undefined;
  const where: Prisma.ColorWhereInput = {
    ...(isActive === undefined ? {} : { isActive }),
    ...(search
      ? { name: { contains: search, mode: "insensitive" } }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.color.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.color.count({ where }),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

export async function listSizes(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const isActive =
    query.isActive === "false" ? false : query.isActive === "true" ? true : undefined;
  const search =
    typeof query.search === "string" && query.search.trim().length > 0
      ? query.search.trim()
      : undefined;
  const where: Prisma.SizeWhereInput = {
    ...(isActive === undefined ? {} : { isActive }),
    ...(search
      ? {
          OR: [
            { label: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.size.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.size.count({ where }),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

export async function createColor(input: {
  name: string;
  hexCode?: string | null;
  sortOrder?: number;
}) {
  return prisma.color.create({
    data: {
      name: input.name.trim(),
      hexCode: input.hexCode?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function createSize(input: {
  label: string;
  code: string;
  sortOrder?: number;
}) {
  const code = input.code.trim().toUpperCase();
  return prisma.size.create({
    data: {
      label: input.label.trim(),
      code,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export { slugify };
