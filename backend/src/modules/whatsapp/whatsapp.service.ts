import { Prisma, WhatsAppMessageStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../middleware/error-handler.js";
import { normalizeWhatsAppPhone } from "../../lib/phone.js";
import { addContact, sendTemplateMessage, WatiUnreachableError } from "./wati.client.js";

/** Public API PDF link that goes into template variable {{4}} (NOT the www redirect page). */
function invoiceLink(orderId: string): string {
  return `${env.PUBLIC_API_BASE_URL.replace(/\/$/, "")}/i/${encodeURIComponent(orderId)}`;
}

function extractProviderMessageId(body: unknown): string | null {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const key of ["id", "messageId", "whatsappMessageId", "ticketId"]) {
      const v = b[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return null;
}

/** WATI can return HTTP 200 with `result: false` for an invalid number/template — check the body. */
function isWatiSuccess(res: { ok: boolean; body: unknown }): boolean {
  if (!res.ok) return false;
  if (res.body && typeof res.body === "object") {
    const b = res.body as Record<string, unknown>;
    if (b.result === false) return false;
    if (typeof b.result === "string" && b.result.toLowerCase() === "false") return false;
    if (b.validWhatsAppNumber === false) return false;
  }
  return true;
}

export type SendInvoiceResult = {
  status: WhatsAppMessageStatus;
  dryRun?: boolean;
};

/**
 * Send the invoice for a confirmed sale to the customer's WhatsApp via WATI.
 * Runs strictly AFTER checkout has committed — never inside the sale transaction —
 * so a WhatsApp failure can never affect money or stock. Every attempt is recorded
 * in `whatsapp_logs`.
 */
export async function sendInvoiceForOrder(input: {
  orderId: string;
  sentById: string | null;
  force?: boolean;
}): Promise<SendInvoiceResult> {
  const { orderId, force } = input;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      documentType: true,
      status: true,
      invoiceNumber: true,
      grandTotal: true,
      customer: { select: { id: true, fullName: true, phone: true } },
    },
  });
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  if (order.documentType !== "SALE" || order.status !== "CONFIRMED" || !order.invoiceNumber) {
    throw new AppError(400, "INVOICE_NOT_SENDABLE", "Only confirmed sale invoices can be sent");
  }

  const phone = normalizeWhatsAppPhone(order.customer?.phone);
  if (!phone) {
    throw new AppError(400, "NO_PHONE", "This sale has no valid customer phone number");
  }

  // Guard against duplicate charged messages. Blocks a plain resend when we either already
  // sent, OR had a previous attempt whose outcome we couldn't confirm (timeout / server error) —
  // that one MAY have been delivered, so a silent retry risks a duplicate. A deliberate resend
  // passes force after the operator has verified.
  if (!force) {
    const blocker = await prisma.whatsAppLog.findFirst({
      where: {
        orderId,
        OR: [
          {
            status: {
              in: [WhatsAppMessageStatus.SENT, WhatsAppMessageStatus.DELIVERED, WhatsAppMessageStatus.READ],
            },
          },
          { errorCode: "UNCONFIRMED" },
        ],
      },
      select: { status: true },
    });
    if (blocker) {
      const sentStatuses: WhatsAppMessageStatus[] = [
        WhatsAppMessageStatus.SENT,
        WhatsAppMessageStatus.DELIVERED,
        WhatsAppMessageStatus.READ,
      ];
      const alreadySent = sentStatuses.includes(blocker.status);
      throw new AppError(
        409,
        alreadySent ? "ALREADY_SENT" : "SEND_UNCONFIRMED",
        alreadySent
          ? "Invoice already sent on WhatsApp for this order"
          : "A previous send couldn't be confirmed and may already have been delivered. Check the customer's WhatsApp before resending.",
      );
    }
  }

  const customerName = order.customer?.fullName?.trim() || "there";
  const parameters = [
    { name: "1", value: customerName },
    { name: "2", value: order.invoiceNumber },
    { name: "3", value: order.grandTotal.toFixed(2) },
    { name: "4", value: invoiceLink(orderId) },
  ];

  // Dry-run when disabled: record intent, do not call WATI. Lets us build/test without a token.
  if (!env.WHATSAPP_ENABLED) {
    await prisma.whatsAppLog.create({
      data: {
        customerId: order.customer?.id ?? null,
        orderId,
        templateName: env.WATI_INVOICE_TEMPLATE_NAME,
        toPhone: phone,
        payload: { dryRun: true, parameters } as Prisma.InputJsonValue,
        status: WhatsAppMessageStatus.QUEUED,
      },
    });
    logger.info({ orderId, phone, parameters }, "WhatsApp dry-run (WHATSAPP_ENABLED=false)");
    return { status: WhatsAppMessageStatus.QUEUED, dryRun: true };
  }

  const log = await prisma.whatsAppLog.create({
    data: {
      customerId: order.customer?.id ?? null,
      orderId,
      templateName: env.WATI_INVOICE_TEMPLATE_NAME,
      toPhone: phone,
      payload: { parameters } as Prisma.InputJsonValue,
      status: WhatsAppMessageStatus.QUEUED,
    },
  });

  await addContact({ phone, name: order.customer?.fullName ?? null });

  let res;
  try {
    res = await sendTemplateMessage({
      phone,
      templateName: env.WATI_INVOICE_TEMPLATE_NAME,
      broadcastName: env.WATI_BROADCAST_NAME || env.WATI_INVOICE_TEMPLATE_NAME,
      parameters,
    });
  } catch (err) {
    // No response from WATI (timeout / network). Delivery is UNKNOWN — it may have gone through.
    // Mark UNCONFIRMED so a plain retry is blocked (prevents duplicate charges).
    const detail = err instanceof WatiUnreachableError || err instanceof Error ? err.message : "WATI request failed";
    await prisma.whatsAppLog.update({
      where: { id: log.id },
      data: { status: WhatsAppMessageStatus.FAILED, errorCode: "UNCONFIRMED", errorDetail: detail.slice(0, 1000) },
    });
    throw new AppError(
      502,
      "WHATSAPP_SEND_UNCONFIRMED",
      "Couldn't confirm the WhatsApp send (network/timeout). It may already have been delivered — check the customer's WhatsApp before resending.",
    );
  }

  if (!isWatiSuccess(res)) {
    // A 5xx means WATI itself errored — delivery is ambiguous, so treat as UNCONFIRMED.
    // A 4xx / explicit body-level rejection means it was definitely NOT sent — safe to retry.
    const unconfirmed = res.status >= 500;
    const detail = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
    await prisma.whatsAppLog.update({
      where: { id: log.id },
      data: {
        status: WhatsAppMessageStatus.FAILED,
        errorCode: unconfirmed ? "UNCONFIRMED" : `HTTP_${res.status}`,
        errorDetail: detail.slice(0, 1000),
        payload: { parameters, response: res.body } as Prisma.InputJsonValue,
      },
    });
    throw new AppError(
      502,
      unconfirmed ? "WHATSAPP_SEND_UNCONFIRMED" : "WHATSAPP_SEND_FAILED",
      unconfirmed
        ? "WhatsApp provider had a server error — delivery is unconfirmed. Check before resending."
        : "WhatsApp provider rejected the message",
    );
  }

  await prisma.whatsAppLog.update({
    where: { id: log.id },
    data: {
      status: WhatsAppMessageStatus.SENT,
      sentAt: new Date(),
      providerMessageId: extractProviderMessageId(res.body),
      payload: { parameters, response: res.body } as Prisma.InputJsonValue,
    },
  });

  return { status: WhatsAppMessageStatus.SENT };
}
