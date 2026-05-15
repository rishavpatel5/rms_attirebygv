import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { buildMeta, parsePagination } from "../../lib/pagination.js";
import { isValidSlug, slugify } from "../../lib/slug.js";

export async function listCategories(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const rawParent = query.parentId;
  let parentId: string | null | undefined = undefined;
  if (typeof rawParent === "string") {
    if (rawParent === "" || rawParent === "null") {
      parentId = null;
    } else {
      parentId = rawParent;
    }
  }

  const isActive =
    query.isActive === "true"
      ? true
      : query.isActive === "false"
        ? false
        : undefined;
  const search =
    typeof query.search === "string" && query.search.trim().length > 0
      ? query.search.trim()
      : undefined;

  const where: Prisma.CategoryWhereInput = {
    ...(parentId === undefined ? {} : { parentId }),
    ...(isActive === undefined ? {} : { isActive }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.category.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    }),
    prisma.category.count({ where }),
  ]);

  return { items, meta: buildMeta(page, limit, total) };
}

export async function getCategoryById(id: string) {
  const row = await prisma.category.findUnique({
    where: { id },
    include: { parent: true, _count: { select: { products: true } } },
  });
  if (!row) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
  }
  return row;
}

export async function createCategory(input: {
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
}) {
  if (!isValidSlug(input.slug)) {
    throw new AppError(400, "INVALID_SLUG", "Invalid slug format");
  }
  if (input.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: input.parentId },
    });
    if (!parent) {
      throw new AppError(404, "PARENT_NOT_FOUND", "Parent category not found");
    }
  }
  try {
    return await prisma.category.create({
      data: {
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase(),
        description: input.description?.trim() ?? null,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2002") {
      throw new AppError(409, "SLUG_IN_USE", "Category slug already exists");
    }
    throw e;
  }
}

export async function updateCategory(
  id: string,
  input: {
    name?: string;
    slug?: string;
    description?: string | null;
    parentId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  if (input.slug !== undefined && !isValidSlug(input.slug)) {
    throw new AppError(400, "INVALID_SLUG", "Invalid slug format");
  }
  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) {
      throw new AppError(400, "INVALID_PARENT", "Category cannot be its own parent");
    }
    const parent = await prisma.category.findUnique({
      where: { id: input.parentId },
    });
    if (!parent) {
      throw new AppError(404, "PARENT_NOT_FOUND", "Parent category not found");
    }
  }
  try {
    return await prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.slug !== undefined
          ? { slug: input.slug.trim().toLowerCase() }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() ?? null }
          : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2025") {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    if (code === "P2002") {
      throw new AppError(409, "SLUG_IN_USE", "Category slug already exists");
    }
    throw e;
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const count = await prisma.product.count({ where: { categoryId: id } });
  if (count > 0) {
    throw new AppError(
      409,
      "CATEGORY_IN_USE",
      "Cannot delete category while products reference it",
      { productCount: count },
    );
  }
  const childCount = await prisma.category.count({ where: { parentId: id } });
  if (childCount > 0) {
    throw new AppError(
      409,
      "CATEGORY_HAS_CHILDREN",
      "Cannot delete category with child categories",
    );
  }
  try {
    await prisma.category.delete({ where: { id } });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2025") {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    throw e;
  }
}

export { slugify };
