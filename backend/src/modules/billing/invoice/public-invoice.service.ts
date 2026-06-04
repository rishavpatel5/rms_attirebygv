import { OrderDocumentType, OrderStatus } from "@prisma/client";
import { AppError } from "../../../middleware/error-handler.js";
import { fetchOrderForInvoice } from "./invoice.repository.js";
import { generateOrderInvoicePdf } from "./invoice.service.js";

/** Customer-facing invoice PDF — no auth; only confirmed sales. */
export async function generatePublicSaleInvoicePdf(orderId: string) {
  const row = await fetchOrderForInvoice(orderId);
  if (row.documentType !== OrderDocumentType.SALE) {
    throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  }
  if (row.status !== OrderStatus.CONFIRMED) {
    throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  }
  if (!row.invoiceNumber) {
    throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  }
  return generateOrderInvoicePdf(orderId);
}
