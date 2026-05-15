import { OrderDocumentType, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { buildMeta, parsePagination } from "../../lib/pagination.js";

export type PosCustomerSearchRow = {
  id: string;
  fullName: string;
  phone: string | null;
  orderCount: number;
  lifetimeSpend: string;
  lastPurchaseAt: string | null;
};

/** POS typeahead: name or phone fragment, with lightweight purchase stats for confirmed sales. */
export async function searchCustomersForPos(
  q: string,
  limit = 12,
): Promise<PosCustomerSearchRow[]> {
  const term = q.trim();
  if (term.length < 1) return [];

  const take = Math.min(Math.max(limit, 1), 24);
  const digitsOnly = term.replace(/\D/g, "");

  const or: Prisma.CustomerWhereInput[] = [
    { fullName: { contains: term, mode: "insensitive" } },
  ];
  if (digitsOnly.length > 0) {
    or.push({ phone: { contains: digitsOnly, mode: "insensitive" } });
  }

  const rows = await prisma.customer.findMany({
    where: { OR: or },
    take,
    orderBy: { updatedAt: "desc" },
    select: { id: true, fullName: true, phone: true },
  });
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const aggs = await prisma.order.groupBy({
    by: ["customerId"],
    where: {
      customerId: { in: ids },
      status: OrderStatus.CONFIRMED,
      documentType: OrderDocumentType.SALE,
    },
    _count: { _all: true },
    _sum: { grandTotal: true },
    _max: { confirmedAt: true },
  });

  const stats = new Map(
    aggs.map((a) => [
      a.customerId!,
      {
        orderCount: a._count._all,
        lifetimeSpend: (a._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2),
        lastPurchaseAt: a._max.confirmedAt?.toISOString() ?? null,
      },
    ]),
  );

  return rows.map((r) => {
    const s = stats.get(r.id);
    return {
      id: r.id,
      fullName: r.fullName,
      phone: r.phone,
      orderCount: s?.orderCount ?? 0,
      lifetimeSpend: s?.lifetimeSpend ?? "0.00",
      lastPurchaseAt: s?.lastPurchaseAt ?? null,
    };
  });
}

export async function listCustomers(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const search =
    typeof query.search === "string" && query.search.trim().length > 0
      ? query.search.trim()
      : undefined;

  const where: Prisma.CustomerWhereInput = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { orders: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, meta: buildMeta(page, limit, total) };
}

export async function getCustomerById(id: string) {
  const row = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      notes: true,
      marketingOptIn: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");

  const agg = await prisma.order.aggregate({
    where: {
      customerId: id,
      status: OrderStatus.CONFIRMED,
      documentType: OrderDocumentType.SALE,
    },
    _count: { _all: true },
    _sum: { grandTotal: true },
    _max: { confirmedAt: true },
  });

  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stats: {
      orderCount: agg._count._all,
      lifetimeSpend: (agg._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2),
      lastPurchaseAt: agg._max.confirmedAt?.toISOString() ?? null,
    },
  };
}

export type CustomerOrderSummary = {
  id: string;
  invoiceNumber: string | null;
  documentType: OrderDocumentType;
  status: OrderStatus;
  grandTotal: string;
  discountTotal: string;
  gstEnabled: boolean;
  confirmedAt: string | null;
  createdAt: string;
  lineCount: number;
};

/** Paginated purchase history for a customer (sales + credit notes). */
export async function listCustomerOrders(
  customerId: string,
  query: Record<string, unknown>,
): Promise<{ items: CustomerOrderSummary[]; meta: ReturnType<typeof buildMeta> }> {
  const exists = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!exists) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");

  const { page, limit, skip } = parsePagination(query);

  const where: Prisma.OrderWhereInput = {
    customerId,
    status: OrderStatus.CONFIRMED,
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        invoiceNumber: true,
        documentType: true,
        status: true,
        grandTotal: true,
        discountTotal: true,
        gstEnabled: true,
        confirmedAt: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const items: CustomerOrderSummary[] = rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    documentType: r.documentType,
    status: r.status,
    grandTotal: r.grandTotal.toFixed(2),
    discountTotal: r.discountTotal.toFixed(2),
    gstEnabled: r.gstEnabled,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    lineCount: r._count.items,
  }));

  return { items, meta: buildMeta(page, limit, total) };
}

export async function createCustomer(input: {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  marketingOptIn?: boolean;
}) {
  try {
    return await prisma.customer.create({
      data: {
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        notes: input.notes?.trim() || null,
        marketingOptIn: input.marketingOptIn ?? false,
      },
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2002") {
      throw new AppError(409, "CUSTOMER_DUPLICATE", "Phone or email already in use");
    }
    throw e;
  }
}

export async function updateCustomer(
  id: string,
  input: {
    fullName?: string;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    marketingOptIn?: boolean;
  },
) {
  try {
    return await prisma.customer.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        ...(input.email !== undefined
          ? { email: input.email?.trim().toLowerCase() || null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.marketingOptIn !== undefined
          ? { marketingOptIn: input.marketingOptIn }
          : {}),
      },
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2025") {
      throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
    }
    if (code === "P2002") {
      throw new AppError(409, "CUSTOMER_DUPLICATE", "Phone or email already in use");
    }
    throw e;
  }
}
