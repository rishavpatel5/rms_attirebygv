import {
  CapitalEntryType,
  OrderStatus,
  Prisma,
  PurchaseOrderStatus,
  PurchaseReturnSettlement,
  PurchaseReturnStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { buildMeta, parsePagination } from "../../lib/pagination.js";
import type { CreateCapitalEntryBody, UpdateCapitalEntryBody } from "./capital.validators.js";

// ── Ledger CRUD ───────────────────────────────────────────────────────────────

export async function listCapitalEntries(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const type = query.type as CapitalEntryType | undefined;

  const where: Prisma.CapitalEntryWhereInput = { ...(type ? { type } : {}) };

  const [items, total] = await Promise.all([
    prisma.capitalEntry.findMany({ where, orderBy: { date: "desc" }, skip, take: limit }),
    prisma.capitalEntry.count({ where }),
  ]);

  return { items, meta: buildMeta(page, limit, total) };
}

export async function createCapitalEntry(input: CreateCapitalEntryBody) {
  return prisma.capitalEntry.create({
    data: {
      type: input.type,
      amount: new Prisma.Decimal(input.amount),
      date: new Date(input.date),
      note: input.note?.trim() || null,
    },
  });
}

export async function updateCapitalEntry(id: string, input: UpdateCapitalEntryBody) {
  try {
    return await prisma.capitalEntry.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
        ...(input.date !== undefined ? { date: new Date(input.date) } : {}),
        ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
      },
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
    if (code === "P2025") throw new AppError(404, "CAPITAL_ENTRY_NOT_FOUND", "Entry not found");
    throw e;
  }
}

export async function deleteCapitalEntry(id: string) {
  try {
    await prisma.capitalEntry.delete({ where: { id } });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
    if (code === "P2025") throw new AppError(404, "CAPITAL_ENTRY_NOT_FOUND", "Entry not found");
    throw e;
  }
}

// ── Business position (all-time, as of today) ─────────────────────────────────

type Aggregates = {
  salesCollected: number;
  stockCashOut: number;
  operatingExpenses: number;
  inventoryValue: number;
  promoCost: number;
};

/** Live figures the cash position is built from. All-time, ignores any date filter. */
async function liveAggregates(): Promise<Aggregates> {
  const [sales, stock, expenses, valuationRows, promoRows] = await Promise.all([
    // Sales collected — every confirmed sale is paid on the spot.
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: { status: OrderStatus.CONFIRMED, documentType: "SALE" },
    }),
    // Stock cash-out — paid on receipt, so received purchase orders = cash spent.
    prisma.purchaseOrder.aggregate({
      _sum: { grandTotal: true },
      where: { status: PurchaseOrderStatus.RECEIVED },
    }),
    // Operating expenses.
    prisma.expense.aggregate({ _sum: { amount: true } }),
    // Inventory still on hand, at pre-GST WAC (for the context footnote).
    prisma.$queryRaw<{ v: string | null }[]>(Prisma.sql`
      WITH wac AS (
        SELECT variant_id,
          SUM(quantity_received::numeric * unit_cost_exclusive::numeric)
            / NULLIF(SUM(quantity_received::numeric), 0) AS unit_cost_wac
        FROM purchase_order_items WHERE quantity_received > 0 GROUP BY variant_id
      )
      SELECT COALESCE(SUM(ib.quantity::numeric * COALESCE(w.unit_cost_wac, 0)), 0)::text AS v
      FROM inventory_balances ib
      LEFT JOIN wac w ON w.variant_id = ib.variant_id
      WHERE ib.quantity > 0
    `),
    // Promotional (giveaway) cost — matches the Expenses page net-profit formula.
    prisma.$queryRaw<{ giveaway_cost: string }[]>(Prisma.sql`
      WITH wac AS (
        SELECT variant_id,
          CASE WHEN SUM(quantity_received::numeric) > 0
            THEN SUM(quantity_received::numeric * unit_cost_exclusive::numeric)
                 / NULLIF(SUM(quantity_received::numeric), 0)
            ELSE NULL END AS unit_cost_wac
        FROM purchase_order_items WHERE quantity_received > 0 GROUP BY variant_id
      )
      SELECT COALESCE(SUM(
        CASE WHEN oi.is_giveaway OR oi.line_total::numeric = 0
             THEN oi.quantity::numeric
                  * COALESCE(oi.unit_cost_snapshot, w.unit_cost_wac, pv.cost_price, 0::numeric)
             ELSE 0::numeric END
      ), 0)::text AS giveaway_cost
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      INNER JOIN product_variants pv ON pv.id = oi.variant_id
      LEFT JOIN wac w ON w.variant_id = oi.variant_id
      WHERE o.document_type = 'SALE'::"OrderDocumentType"
        AND o.status = 'CONFIRMED'::"OrderStatus"
    `),
  ]);

  return {
    salesCollected: Number(sales._sum.grandTotal ?? 0),
    stockCashOut: Number(stock._sum.grandTotal ?? 0),
    operatingExpenses: Number(expenses._sum.amount ?? 0),
    inventoryValue: Number(valuationRows[0]?.v ?? 0),
    promoCost: Number(promoRows[0]?.giveaway_cost ?? 0),
  };
}

async function capitalTotals(): Promise<{ capitalIntroduced: number; ownerDrawings: number }> {
  const rows = await prisma.capitalEntry.groupBy({ by: ["type"], _sum: { amount: true } });
  let capitalIntroduced = 0;
  let ownerDrawings = 0;
  for (const r of rows) {
    const v = Number(r._sum.amount ?? 0);
    if (r.type === CapitalEntryType.INVESTMENT) capitalIntroduced = v;
    else ownerDrawings = v;
  }
  return { capitalIntroduced, ownerDrawings };
}

/** Confirmed supplier returns: actual refund (cash-family only) and realized gain/loss. */
async function purchaseReturnTotals(): Promise<{ supplierRefunds: number; gainLoss: number }> {
  const [refund, diff] = await Promise.all([
    prisma.purchaseReturn.aggregate({
      _sum: { refundAmount: true },
      where: {
        status: PurchaseReturnStatus.CONFIRMED,
        settlementMethod: {
          in: [PurchaseReturnSettlement.CASH, PurchaseReturnSettlement.BANK, PurchaseReturnSettlement.UPI],
        },
      },
    }),
    prisma.purchaseReturn.aggregate({
      _sum: { difference: true },
      where: { status: PurchaseReturnStatus.CONFIRMED },
    }),
  ]);
  return {
    supplierRefunds: Number(refund._sum.refundAmount ?? 0),
    gainLoss: Number(diff._sum.difference ?? 0),
  };
}

export async function getBusinessPosition() {
  const [agg, cap, ret] = await Promise.all([
    liveAggregates(),
    capitalTotals(),
    purchaseReturnTotals(),
  ]);

  const cashInHand =
    cap.capitalIntroduced +
    agg.salesCollected -
    agg.stockCashOut -
    agg.operatingExpenses -
    cap.ownerDrawings +
    ret.supplierRefunds;

  // Same definition as the Expenses page "Net profit" card, plus realized purchase-return gain/loss.
  const netProfit = agg.salesCollected - agg.operatingExpenses - agg.promoCost + ret.gainLoss;

  return {
    capitalIntroduced: cap.capitalIntroduced,
    ownerDrawings: cap.ownerDrawings,
    salesCollected: agg.salesCollected,
    stockCashOut: agg.stockCashOut,
    operatingExpenses: agg.operatingExpenses,
    inventoryValue: agg.inventoryValue,
    supplierRefunds: ret.supplierRefunds,
    purchaseReturnGainLoss: ret.gainLoss,
    netProfit,
    cashInHand,
    hasCapital: cap.capitalIntroduced > 0 || cap.ownerDrawings > 0,
  };
}

/**
 * Seed (or top up) capital so that cash-in-hand equals the owner's real cash.
 * Solves: target = (existingCapital + opening) + sales − stock − expenses − drawings.
 */
export async function setOpeningCash(targetCash: number) {
  const [agg, cap, ret] = await Promise.all([
    liveAggregates(),
    capitalTotals(),
    purchaseReturnTotals(),
  ]);

  const opening =
    targetCash -
    cap.capitalIntroduced +
    agg.stockCashOut +
    agg.operatingExpenses -
    agg.salesCollected +
    cap.ownerDrawings -
    ret.supplierRefunds;

  if (opening <= 0) {
    throw new AppError(
      400,
      "INVALID_OPENING_CASH",
      "That cash figure implies you'd need to remove capital — check the amount (it looks too low for what's been spent on stock/expenses).",
    );
  }

  const entry = await prisma.capitalEntry.create({
    data: {
      type: CapitalEntryType.INVESTMENT,
      amount: new Prisma.Decimal(opening).toDecimalPlaces(2),
      date: new Date(),
      note: "Opening capital — back-calculated from cash in hand",
    },
  });

  return { entry, position: await getBusinessPosition() };
}
