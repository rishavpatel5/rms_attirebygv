import { serializeOrderForReport } from "../orders-report.serializer.js";
import type { InvoiceDocument } from "./invoice-document.types.js";
import { generateInvoicePdfBuffer } from "./invoice-pdf.generator.js";
import { fetchOrderForInvoice } from "./invoice.repository.js";

export async function getInvoiceDocument(orderId: string): Promise<InvoiceDocument> {
  const row = await fetchOrderForInvoice(orderId);
  return serializeOrderForReport(row);
}

export function invoicePdfFilename(doc: InvoiceDocument): string {
  const base = doc.invoiceNumber?.replace(/[^\w-]+/g, "_") ?? doc.id;
  return `${base}.pdf`;
}

/** Dynamic PDF from stored order totals — no separate invoice math. */
export async function generateOrderInvoicePdf(orderId: string): Promise<{
  buffer: Buffer;
  filename: string;
  document: InvoiceDocument;
}> {
  const document = await getInvoiceDocument(orderId);
  const buffer = await generateInvoicePdfBuffer(document);
  return {
    buffer,
    filename: invoicePdfFilename(document),
    document,
  };
}

/** Future WhatsApp / email attachments — same generator, ephemeral buffer. */
export async function generateOrderInvoicePdfBuffer(orderId: string): Promise<Buffer> {
  const { buffer } = await generateOrderInvoicePdf(orderId);
  return buffer;
}
