import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export async function listImages(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  return prisma.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function addImage(input: {
  productId: string;
  url: string;
  altText?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
}) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
  });
  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  const url = input.url.trim();
  if (url.length < 8 || url.length > 2048) {
    throw new AppError(400, "INVALID_URL", "Invalid image URL");
  }

  return prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.productImage.updateMany({
        where: { productId: input.productId },
        data: { isPrimary: false },
      });
    }
    const maxSort = await tx.productImage.aggregate({
      where: { productId: input.productId },
      _max: { sortOrder: true },
    });
    const sortOrder =
      input.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1;
    return tx.productImage.create({
      data: {
        productId: input.productId,
        url,
        altText: input.altText?.trim() || null,
        sortOrder,
        isPrimary: input.isPrimary ?? false,
      },
    });
  });
}

export async function updateImage(
  id: string,
  input: {
    url?: string;
    altText?: string | null;
    sortOrder?: number;
    isPrimary?: boolean;
  },
) {
  const existing = await prisma.productImage.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError(404, "IMAGE_NOT_FOUND", "Image not found");
  }
  return prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.productImage.updateMany({
        where: { productId: existing.productId },
        data: { isPrimary: false },
      });
    }
    return tx.productImage.update({
      where: { id },
      data: {
        ...(input.url !== undefined
          ? { url: input.url.trim() }
          : {}),
        ...(input.altText !== undefined
          ? { altText: input.altText?.trim() || null }
          : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      },
    });
  });
}

export async function reorderImages(
  productId: string,
  orderedIds: string[],
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  const images = await prisma.productImage.findMany({
    where: { productId },
    select: { id: true },
  });
  const set = new Set(images.map((i) => i.id));
  if (orderedIds.length !== set.size || orderedIds.some((id) => !set.has(id))) {
    throw new AppError(
      400,
      "INVALID_IMAGE_ORDER",
      "orderedIds must include each image exactly once",
    );
  }
  await prisma.$transaction(
    orderedIds.map((imageId, index) =>
      prisma.productImage.update({
        where: { id: imageId },
        data: { sortOrder: index },
      }),
    ),
  );
}

export async function deleteImage(id: string): Promise<void> {
  try {
    await prisma.productImage.delete({ where: { id } });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2025") {
      throw new AppError(404, "IMAGE_NOT_FOUND", "Image not found");
    }
    throw e;
  }
}
