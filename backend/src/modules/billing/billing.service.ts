import {
  ExchangeStatus,
  InventoryReferenceKind,
  OrderDocumentType,
  OrderStatus,
  PaymentNature,
  PaymentStatus,
  Prisma,
  ReturnDisposition,
  SalesReturnStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { runInTransaction } from "../../lib/transaction.js";
import { buildMeta, parsePagination } from "../../lib/pagination.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  applyInventoryMovement,
  type Tx,
} from "../inventory/inventory.service.js";
import { computeLine, computeOrderTotals, type ComputedLine } from "../../lib/gst-calculator.js";
import {
  mapFinalLineToOrderItemCreate,
  mapQuoteTotalsToOrder,
  serializePricingQuote,
} from "../../lib/pricing-engine.js";
import type {
  CreditNoteBody,
  DraftOrderBody,
  ExchangeBody,
  PosCheckoutBody,
  PosQuoteBody,
} from "./billing.validators.js";
import { mapPayments } from "./billing.validators.js";
import { buildPosPricingQuote } from "./billing.pricing.js";
import { resolveCustomerForPosCheckout } from "../customers/customer-checkout-resolution.js";
import { parseUtcDayRange } from "../analytics/analytics.range.js";
import { serializeOrderForReport } from "./orders-report.serializer.js";
import type { OrdersReportQuery } from "../analytics/analytics.validators.js";
import { ORDER_INVOICE_INCLUDE } from "./invoice/invoice.repository.js";
import { getInvoiceDocument } from "./invoice/invoice.service.js";

function d2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function assertPaymentTotalsSale(
  payments: { amount: Prisma.Decimal; nature: PaymentNature }[],
  grandTotal: Prisma.Decimal,
): void {
  let sum = new Prisma.Decimal(0);
  for (const p of payments) {
    if (p.nature === PaymentNature.RECEIPT) {
      sum = sum.plus(p.amount);
    } else {
      sum = sum.minus(p.amount);
    }
  }
  if (!d2(sum).equals(d2(grandTotal))) {
    throw new AppError(400, "PAYMENT_MISMATCH", "Payments must net to the invoice grand total", {
      expected: d2(grandTotal).toFixed(2),
      actual: d2(sum).toFixed(2),
    });
  }
}

function assertPaymentTotalsCreditNote(
  payments: { amount: Prisma.Decimal; nature: PaymentNature }[],
  grandTotal: Prisma.Decimal,
): void {
  let refunds = new Prisma.Decimal(0);
  for (const p of payments) {
    if (p.nature !== PaymentNature.REFUND) {
      throw new AppError(400, "INVALID_PAYMENT_NATURE", "Credit notes require REFUND payments only");
    }
    refunds = refunds.plus(p.amount);
  }
  if (!d2(refunds).equals(d2(grandTotal))) {
    throw new AppError(400, "PAYMENT_MISMATCH", "Refund payments must equal credit note total", {
      expected: d2(grandTotal).toFixed(2),
      actual: d2(refunds).toFixed(2),
    });
  }
}

async function allocateInvoiceNumber(tx: Tx): Promise<string> {
  try {
    const updated = await tx.invoiceSequence.update({
      where: { id: "singleton" },
      data: { nextSeq: { increment: 1 } },
      select: { nextSeq: true },
    });
    const y = new Date().getUTCFullYear();
    return `INV-${y}-${String(updated.nextSeq).padStart(7, "0")}`;
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2025") {
      await tx.invoiceSequence.create({
        data: { id: "singleton", nextSeq: 0 },
      });
      const updated = await tx.invoiceSequence.update({
        where: { id: "singleton" },
        data: { nextSeq: { increment: 1 } },
        select: { nextSeq: true },
      });
      const y = new Date().getUTCFullYear();
      return `INV-${y}-${String(updated.nextSeq).padStart(7, "0")}`;
    }
    throw e;
  }
}

export function quotePosCheckout(body: PosQuoteBody) {
  const quote = buildPosPricingQuote(body);
  return serializePricingQuote(quote);
}

async function assertOfferIfPresent(
  tx: Tx,
  offerId: string | null | undefined,
  productIds: string[],
): Promise<void> {
  if (!offerId) return;
  const offer = await tx.offer.findUnique({
    where: { id: offerId },
    include: { products: { select: { productId: true } } },
  });
  if (!offer || !offer.isActive) {
    throw new AppError(404, "OFFER_NOT_FOUND", "Offer not found or inactive");
  }
  const now = new Date();
  if (offer.startsAt && now < offer.startsAt) {
    throw new AppError(400, "OFFER_NOT_STARTED", "Offer has not started yet");
  }
  if (offer.endsAt && now > offer.endsAt) {
    throw new AppError(400, "OFFER_EXPIRED", "Offer has expired");
  }
  const allowed = new Set(offer.products.map((p) => p.productId));
  for (const pid of productIds) {
    if (!allowed.has(pid)) {
      throw new AppError(400, "OFFER_NOT_APPLICABLE", "Offer does not apply to one or more products", {
        productId: pid,
      });
    }
  }
}

async function loadActiveVariants(
  tx: Tx,
  variantIds: string[],
): Promise<Map<string, { id: string; productId: string }>> {
  const unique = [...new Set(variantIds)];
  const rows = await tx.productVariant.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true, productId: true },
  });
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of unique) {
    if (!map.has(id)) {
      throw new AppError(404, "VARIANT_NOT_FOUND", "Active variant not found", { variantId: id });
    }
  }
  return map;
}

async function applySaleOutForOrder(
  tx: Tx,
  orderId: string,
  lines: { variantId: string; quantity: number }[],
  createdById: string | null,
): Promise<void> {
  const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
  for (const ln of sorted) {
    await applyInventoryMovement(tx, {
      variantId: ln.variantId,
      quantityDelta: -ln.quantity,
      movementType: "SALE_OUT",
      referenceKind: InventoryReferenceKind.ORDER,
      referenceId: orderId,
      createdById,
      metadata: { orderId },
    });
  }
}

async function applySaleReversalForCreditNote(
  tx: Tx,
  creditNoteId: string,
  lines: { variantId: string; quantity: number }[],
  createdById: string | null,
): Promise<void> {
  const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
  for (const ln of sorted) {
    await applyInventoryMovement(tx, {
      variantId: ln.variantId,
      quantityDelta: ln.quantity,
      movementType: "SALE_REVERSAL_IN",
      referenceKind: InventoryReferenceKind.ORDER,
      referenceId: creditNoteId,
      createdById,
      metadata: { creditNoteId },
    });
  }
}

export async function checkoutPos(input: {
  body: PosCheckoutBody;
  createdById: string | null;
}): Promise<{ orderId: string }> {
  const { body, createdById } = input;
  if (body.idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey: body.idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      return { orderId: existing.id };
    }
  }

  const pricing = buildPosPricingQuote(body);
  const payments = mapPayments(body.payments);
  assertPaymentTotalsSale(payments, pricing.totals.grandTotal);

  const variantIds = pricing.lines.map((l) => l.variantId);

  return runInTransaction(async (tx) => {
    const vmap = await loadActiveVariants(tx, variantIds);
    const productsFromVariants = [...new Set(variantIds.map((id) => vmap.get(id)!.productId))];
    await assertOfferIfPresent(tx, body.offerId ?? null, productsFromVariants);

    const { customerId, isWalkIn } = await resolveCustomerForPosCheckout(tx, {
      customerId: body.customerId,
      customerSnapshot: body.customerSnapshot ?? null,
    });

    const invoiceNumber = await allocateInvoiceNumber(tx);
    const order = await tx.order.create({
      data: {
        documentType: OrderDocumentType.SALE,
        status: OrderStatus.CONFIRMED,
        invoiceNumber,
        customerId,
        isWalkIn,
        gstEnabled: body.gstEnabled,
        gstPricingMode: body.gstPricingMode,
        currency: body.currency,
        ...mapQuoteTotalsToOrder(pricing.totals, pricing.cartDiscount),
        notes: body.notes ?? null,
        idempotencyKey: body.idempotencyKey ?? null,
        createdById,
        confirmedAt: new Date(),
        offerId: body.offerId ?? null,
        items: {
          create: pricing.lines.map((ln) => mapFinalLineToOrderItemCreate(ln)),
        },
        payments: {
          create: payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            nature: p.nature,
            status: PaymentStatus.COMPLETED,
            externalRef: p.externalRef,
            metadata: p.metadata as Prisma.InputJsonValue | undefined,
          })),
        },
      },
      select: { id: true },
    });

    await applySaleOutForOrder(
      tx,
      order.id,
      pricing.lines.map((c) => ({ variantId: c.variantId, quantity: c.quantity })),
      createdById,
    );

    return { orderId: order.id };
  });
}

export async function createDraftOrder(input: {
  body: DraftOrderBody;
  createdById: string | null;
}): Promise<{ orderId: string }> {
  const { body, createdById } = input;
  const pricing = buildPosPricingQuote(body);
  const payments = body.payments?.length ? mapPayments(body.payments) : [];

  const variantIds = pricing.lines.map((l) => l.variantId);

  return runInTransaction(async (tx) => {
    const vmap = await loadActiveVariants(tx, variantIds);
    const productsFromVariants = [...new Set(variantIds.map((id) => vmap.get(id)!.productId))];
    await assertOfferIfPresent(tx, body.offerId ?? null, productsFromVariants);

    const { customerId, isWalkIn } = await resolveCustomerForPosCheckout(tx, {
      customerId: body.customerId,
      customerSnapshot: body.customerSnapshot ?? null,
    });

    const order = await tx.order.create({
      data: {
        documentType: OrderDocumentType.SALE,
        status: OrderStatus.DRAFT,
        customerId,
        isWalkIn,
        gstEnabled: body.gstEnabled,
        gstPricingMode: body.gstPricingMode,
        currency: body.currency,
        ...mapQuoteTotalsToOrder(pricing.totals, pricing.cartDiscount),
        notes: body.notes ?? null,
        idempotencyKey: body.idempotencyKey ?? null,
        createdById,
        offerId: body.offerId ?? null,
        items: {
          create: pricing.lines.map((ln) => mapFinalLineToOrderItemCreate(ln)),
        },
      },
      select: { id: true },
    });

    if (payments.length > 0) {
      assertPaymentTotalsSale(payments, pricing.totals.grandTotal);
      await tx.payment.createMany({
        data: payments.map((p) => ({
          orderId: order.id,
          method: p.method,
          amount: p.amount,
          nature: p.nature,
          status: PaymentStatus.COMPLETED,
          externalRef: p.externalRef,
          metadata: p.metadata as Prisma.InputJsonValue | undefined,
        })),
      });
    }

    return { orderId: order.id };
  });
}

export async function confirmDraftOrder(input: {
  orderId: string;
  payments: ReturnType<typeof mapPayments>;
  createdById: string | null;
  idempotencyKey?: string | null;
}): Promise<void> {
  const { orderId, payments, createdById } = input;

  await runInTransaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true },
    });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== OrderStatus.DRAFT) {
      throw new AppError(409, "ORDER_NOT_DRAFT", "Only draft orders can be confirmed", {
        status: order.status,
      });
    }
    if (order.documentType !== OrderDocumentType.SALE) {
      throw new AppError(400, "INVALID_DOCUMENT", "Only sale orders can use this confirm path");
    }

    assertPaymentTotalsSale(payments, order.grandTotal);

    if (order.payments.length > 0) {
      await tx.payment.deleteMany({ where: { orderId } });
    }

    await tx.payment.createMany({
      data: payments.map((p) => ({
        orderId,
        method: p.method,
        amount: p.amount,
        nature: p.nature,
        status: PaymentStatus.COMPLETED,
        externalRef: p.externalRef,
        metadata: p.metadata as Prisma.InputJsonValue | undefined,
      })),
    });

    const invoiceNumber = await allocateInvoiceNumber(tx);
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CONFIRMED,
        invoiceNumber,
        confirmedAt: new Date(),
        ...(input.idempotencyKey !== undefined
          ? { idempotencyKey: input.idempotencyKey ?? null }
          : {}),
      },
    });

    await applySaleOutForOrder(
      tx,
      orderId,
      order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      createdById,
    );
  });
}

export async function getOrderInvoice(orderId: string) {
  const invoice = await getInvoiceDocument(orderId);
  return { invoice };
}

export async function listOrders(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const status =
    typeof query.status === "string" && query.status.length > 0
      ? (query.status as OrderStatus)
      : undefined;
  const documentType =
    typeof query.documentType === "string" && query.documentType.length > 0
      ? (query.documentType as OrderDocumentType)
      : undefined;

  const where: Prisma.OrderWhereInput = {
    ...(status && Object.values(OrderStatus).includes(status) ? { status } : {}),
    ...(documentType &&
    Object.values(OrderDocumentType).includes(documentType)
      ? { documentType }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentType: true,
        status: true,
        invoiceNumber: true,
        grandTotal: true,
        currency: true,
        gstEnabled: true,
        confirmedAt: true,
        createdAt: true,
        customer: { select: { id: true, fullName: true, phone: true } },
        isWalkIn: true,
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { items, meta: buildMeta(page, limit, total) };
}

/** Full order ledger for reports: lines, discounts, GST, payments. */
export async function listOrdersReport(input: OrdersReportQuery) {
  const { start, endExclusive } = parseUtcDayRange(input.from, input.to);
  const { page, limit, skip } = parsePagination({
    page: input.page,
    limit: input.limit,
  });

  const andParts: Prisma.OrderWhereInput[] = [
    {
      OR: [
        { confirmedAt: { gte: start, lt: endExclusive } },
        {
          status: OrderStatus.DRAFT,
          confirmedAt: null,
          createdAt: { gte: start, lt: endExclusive },
        },
      ],
    },
  ];
  if (input.status) andParts.push({ status: input.status });
  if (input.documentType) andParts.push({ documentType: input.documentType });
  if (input.search) {
    const term = input.search.trim();
    andParts.push({
      OR: [
        { invoiceNumber: { contains: term, mode: "insensitive" } },
        { customer: { fullName: { contains: term, mode: "insensitive" } } },
        { customer: { phone: { contains: term, mode: "insensitive" } } },
      ],
    });
  }

  const where: Prisma.OrderWhereInput = { AND: andParts };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
      include: ORDER_INVOICE_INCLUDE,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items: rows.map((row) => serializeOrderForReport(row)),
    meta: buildMeta(page, limit, total),
  };
}

export async function createCreditNote(input: {
  body: CreditNoteBody;
  createdById: string | null;
}): Promise<{ orderId: string }> {
  const { body, createdById } = input;
  if (body.idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey: body.idempotencyKey },
      select: { id: true },
    });
    if (existing) return { orderId: existing.id };
  }

  return runInTransaction(async (tx) => {
    const sale = await tx.order.findUnique({
      where: { id: body.originalSaleId },
      include: { items: true },
    });
    if (!sale) throw new AppError(404, "ORDER_NOT_FOUND", "Original sale not found");
    if (sale.documentType !== OrderDocumentType.SALE) {
      throw new AppError(400, "INVALID_ORIGINAL", "Credit notes can only reference sale invoices");
    }
    if (sale.status !== OrderStatus.CONFIRMED) {
      throw new AppError(409, "SALE_NOT_CONFIRMED", "Original sale must be confirmed");
    }

    const itemById = new Map(sale.items.map((i) => [i.id, i]));
    const computed: ComputedLine[] = [];
    const creditItemRows: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
    const restockMoves: { variantId: string; quantity: number }[] = [];

    for (const ln of body.lines) {
      const oi = itemById.get(ln.orderItemId);
      if (!oi) {
        throw new AppError(400, "ORDER_ITEM_NOT_FOUND", "Order line not on original sale", {
          orderItemId: ln.orderItemId,
        });
      }
      if (ln.quantity > oi.quantity) {
        throw new AppError(400, "RETURN_QTY_EXCEEDS_LINE", "Return quantity exceeds sold quantity", {
          orderItemId: ln.orderItemId,
        });
      }
      const prorata = new Prisma.Decimal(ln.quantity).div(new Prisma.Decimal(oi.quantity));
      const itemDiscountAmount = oi.itemDiscountAmount
        .mul(prorata)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const cartDiscountAllocated = oi.cartDiscountAllocated
        .mul(prorata)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const lineDiscount = oi.lineDiscount.mul(prorata).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const cl = computeLine({
        variantId: oi.variantId,
        quantity: ln.quantity,
        unitPrice: oi.unitPrice,
        lineDiscount,
        gstEnabled: body.gstEnabled,
        gstPricingMode: body.gstPricingMode,
        cgstRate: oi.cgstRate,
        sgstRate: oi.sgstRate,
        igstRate: oi.igstRate,
      });
      computed.push(cl);
      creditItemRows.push({
        variantId: cl.variantId,
        quantity: cl.quantity,
        unitPrice: cl.unitPrice,
        itemDiscountType: oi.itemDiscountType,
        itemDiscountValue: oi.itemDiscountValue,
        itemDiscountAmount,
        cartDiscountAllocated,
        lineDiscount: cl.lineDiscount,
        taxableValue: cl.taxableValue,
        cgstRate: cl.cgstRate,
        sgstRate: cl.sgstRate,
        igstRate: cl.igstRate,
        cgstAmount: cl.cgstAmount,
        sgstAmount: cl.sgstAmount,
        igstAmount: cl.igstAmount,
        lineTotal: cl.lineTotal,
      });
      if (ln.restock) {
        restockMoves.push({ variantId: oi.variantId, quantity: ln.quantity });
      }
    }

    const totals = computeOrderTotals(computed, new Prisma.Decimal(0));
    const payments = mapPayments(body.payments);
    assertPaymentTotalsCreditNote(payments, totals.grandTotal);

    const invoiceNumber = await allocateInvoiceNumber(tx);
    const credit = await tx.order.create({
      data: {
        documentType: OrderDocumentType.CREDIT_NOTE,
        status: OrderStatus.CONFIRMED,
        invoiceNumber,
        originalSaleId: sale.id,
        gstEnabled: body.gstEnabled,
        gstPricingMode: body.gstPricingMode,
        currency: sale.currency,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        itemDiscountTotal: totals.discountTotal,
        cartDiscountAmount: new Prisma.Decimal(0),
        taxableValue: totals.taxableValue,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        igstTotal: totals.igstTotal,
        cessTotal: totals.cessTotal,
        grandTotal: totals.grandTotal,
        roundingAdjustment: totals.roundingAdjustment,
        notes: body.notes ?? null,
        idempotencyKey: body.idempotencyKey ?? null,
        createdById,
        confirmedAt: new Date(),
        isWalkIn: false,
        items: { create: creditItemRows },
        payments: {
          create: payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            nature: PaymentNature.REFUND,
            status: PaymentStatus.COMPLETED,
            externalRef: p.externalRef,
            metadata: p.metadata as Prisma.InputJsonValue | undefined,
          })),
        },
      },
      select: { id: true },
    });

    if (restockMoves.length > 0) {
      await applySaleReversalForCreditNote(tx, credit.id, restockMoves, createdById);
    }

    return { orderId: credit.id };
  });
}

export async function createExchange(input: {
  body: ExchangeBody;
  createdById: string | null;
}): Promise<{ exchangeId: string; salesReturnId: string; newOrderId: string }> {
  const { body, createdById } = input;

  return runInTransaction(async (tx) => {
    const original = await tx.order.findUnique({
      where: { id: body.originalOrderId },
      include: { items: true },
    });
    if (!original) throw new AppError(404, "ORDER_NOT_FOUND", "Original order not found");
    if (original.documentType !== OrderDocumentType.SALE || original.status !== OrderStatus.CONFIRMED) {
      throw new AppError(409, "ORDER_NOT_ELIGIBLE", "Exchanges require a confirmed sale");
    }

    const itemById = new Map(original.items.map((i) => [i.id, i]));

    const exchange = await tx.exchange.create({
      data: {
        originalOrderId: original.id,
        status: ExchangeStatus.OPEN,
        notes: body.notes ?? null,
      },
      select: { id: true },
    });

    const salesReturn = await tx.salesReturn.create({
      data: {
        orderId: original.id,
        status: SalesReturnStatus.APPROVED,
        reason: "POS_EXCHANGE",
        notes: body.notes ?? null,
      },
      select: { id: true },
    });

    for (const rl of body.returnLines) {
      const oi = itemById.get(rl.orderItemId);
      if (!oi) {
        throw new AppError(400, "ORDER_ITEM_NOT_FOUND", "Return line not on original sale", {
          orderItemId: rl.orderItemId,
        });
      }
      if (rl.quantity > oi.quantity) {
        throw new AppError(400, "RETURN_QTY_EXCEEDS_LINE", "Return quantity exceeds sold quantity");
      }
      await tx.salesReturnLine.create({
        data: {
          salesReturnId: salesReturn.id,
          orderItemId: oi.id,
          quantity: rl.quantity,
          disposition:
            rl.disposition === "RESTOCK"
              ? ReturnDisposition.RESTOCK
              : ReturnDisposition.NO_RESTOCK,
        },
      });

      if (rl.disposition === "RESTOCK") {
        await applyInventoryMovement(tx, {
          variantId: oi.variantId,
          quantityDelta: rl.quantity,
          movementType: "EXCHANGE_IN",
          referenceKind: InventoryReferenceKind.EXCHANGE,
          referenceId: exchange.id,
          createdById,
          metadata: { salesReturnId: salesReturn.id, orderItemId: oi.id },
        });
      }
    }

    const ns = body.newSale;
    const pricing = buildPosPricingQuote(ns);
    const payments = mapPayments(ns.payments);
    assertPaymentTotalsSale(payments, pricing.totals.grandTotal);

    await loadActiveVariants(
      tx,
      pricing.lines.map((c) => c.variantId),
    );

    const invoiceNumber = await allocateInvoiceNumber(tx);
    const newOrder = await tx.order.create({
      data: {
        documentType: OrderDocumentType.SALE,
        status: OrderStatus.CONFIRMED,
        invoiceNumber,
        gstEnabled: ns.gstEnabled,
        gstPricingMode: ns.gstPricingMode,
        currency: ns.currency,
        ...mapQuoteTotalsToOrder(pricing.totals, pricing.cartDiscount),
        customerId: original.customerId,
        isWalkIn: original.customerId === null,
        createdById,
        confirmedAt: new Date(),
        items: {
          create: pricing.lines.map((ln) => mapFinalLineToOrderItemCreate(ln)),
        },
        payments: {
          create: payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            nature: p.nature,
            status: PaymentStatus.COMPLETED,
            externalRef: p.externalRef,
            metadata: p.metadata as Prisma.InputJsonValue | undefined,
          })),
        },
      },
      select: { id: true },
    });

    await applySaleOutForOrder(
      tx,
      newOrder.id,
      pricing.lines.map((c) => ({ variantId: c.variantId, quantity: c.quantity })),
      createdById,
    );

    await tx.salesReturn.update({
      where: { id: salesReturn.id },
      data: { status: SalesReturnStatus.COMPLETED, completedAt: new Date() },
    });

    await tx.exchange.update({
      where: { id: exchange.id },
      data: {
        newOrderId: newOrder.id,
        salesReturnId: salesReturn.id,
        status: ExchangeStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    return { exchangeId: exchange.id, salesReturnId: salesReturn.id, newOrderId: newOrder.id };
  });
}

export async function searchPosCatalog(query: Record<string, unknown>) {
  const limitRaw = Number(query.limit ?? 30);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 50)
    : 30;
  const search =
    typeof query.search === "string" && query.search.trim().length > 0
      ? query.search.trim()
      : undefined;
  const skuParam =
    typeof query.sku === "string" && query.sku.trim().length > 0
      ? query.sku.trim()
      : undefined;
  /** Unified term: POS search box sends `search`; legacy callers may send `sku`. */
  const term = skuParam ?? search;

  const variantSkuMatch = term
    ? {
        isActive: true,
        sku: { contains: term, mode: "insensitive" as const },
      }
    : undefined;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { slug: { contains: term, mode: "insensitive" } },
              ...(variantSkuMatch ? [{ variants: { some: variantSkuMatch } }] : []),
            ],
          }
        : {}),
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      kind: true,
      gender: true,
      variants: {
        where: { isActive: true },
        orderBy: { sku: "asc" },
        take: 80,
        select: {
          id: true,
          sku: true,
          listPrice: true,
          gstEnabled: true,
          gstPricingMode: true,
          cgstRate: true,
          sgstRate: true,
          igstRate: true,
          color: { select: { id: true, name: true } },
          size: { select: { id: true, label: true, code: true } },
          inventory: { select: { quantity: true, updatedAt: true } },
        },
      },
    },
  });

  const termLower = term?.toLowerCase();
  const items =
    termLower === undefined
      ? products
      : products
          .map((p) => {
            const nameMatch =
              p.name.toLowerCase().includes(termLower) ||
              p.slug.toLowerCase().includes(termLower);
            if (nameMatch) {
              return p;
            }
            const matchingVariants = p.variants.filter((v) =>
              v.sku.toLowerCase().includes(termLower),
            );
            return matchingVariants.length > 0
              ? { ...p, variants: matchingVariants }
              : p;
          })
          .filter((p) => p.variants.length > 0);

  return { items };
}
