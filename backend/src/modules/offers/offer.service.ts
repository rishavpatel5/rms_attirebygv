import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { buildMeta, parsePagination } from "../../lib/pagination.js";

export async function listOffers(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const isActive =
    query.isActive === "true"
      ? true
      : query.isActive === "false"
        ? false
        : undefined;

  const where: Prisma.OfferWhereInput = {
    ...(isActive === undefined ? {} : { isActive }),
  };

  const [items, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { products: true, orders: true } },
      },
    }),
    prisma.offer.count({ where }),
  ]);

  return { items, meta: buildMeta(page, limit, total) };
}
