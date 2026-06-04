/**
 * WhatsApp "Share invoice" helpers — free click-to-chat flow.
 *
 * No paid API / Meta verification: we open https://wa.me/<phone>?text=<message>
 * with a pre-filled thank-you message. The store owner just taps Send.
 *
 * The invoice download link is intentionally config-driven and stays OFF until a
 * public host is chosen. Set VITE_PUBLIC_INVOICE_BASE_URL once the public invoice
 * route is hosted; the "Download your invoice" line then appears automatically.
 */

const STORE_NAME = "Attire by GV";

/**
 * Normalize a phone number to wa.me format: country code + number, digits only,
 * no "+", spaces, or separators. Returns null when the number is unusable.
 */
export function normalizeWhatsAppPhone(
  raw: string | null | undefined,
  defaultCountryCode = "91",
): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Drop a leading trunk zero (e.g. 0XXXXXXXXXX).
  digits = digits.replace(/^0+/, "");
  // Plain 10-digit local number → prefix the default country code.
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  // Already includes a country code (e.g. 9198XXXXXXXX).
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** Indian-style amount formatting for the message body (e.g. 2,499 / 2,499.50). */
export function formatInvoiceAmount(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

/**
 * Public invoice link. Returns null until VITE_PUBLIC_INVOICE_BASE_URL is set
 * (i.e. until the public invoice route is hosted). Kept here so enabling the
 * link later is a pure config change.
 */
export function buildInvoiceLink(orderId: string): string | null {
  // Prefer explicit public base (often frontend /i/…); else API host serves PDF directly.
  const base = (
    import.meta.env.VITE_PUBLIC_INVOICE_BASE_URL ||
    import.meta.env.VITE_API_URL
  ) as string | undefined;
  if (!base?.trim()) return null;
  return `${base.trim().replace(/\/$/, "")}/i/${encodeURIComponent(orderId)}`;
}

export type ThankYouMessageInput = {
  customerName?: string | null;
  invoiceNumber?: string | null;
  amountPaid?: string | number | null;
  invoiceLink?: string | null;
};

/** Build the pre-filled thank-you message shown in WhatsApp. */
export function buildThankYouMessage(input: ThankYouMessageInput): string {
  const name = input.customerName?.trim() ? input.customerName.trim() : "there";
  const lines: string[] = [`Hello ${name},`, "", `Thank you for shopping with ${STORE_NAME}.`, ""];

  if (input.invoiceNumber) lines.push(`Invoice No: ${input.invoiceNumber}`);
  if (input.amountPaid != null && input.amountPaid !== "") {
    lines.push(`Amount Paid: \u20B9${formatInvoiceAmount(input.amountPaid)}`);
  }
  if (input.invoiceLink) {
    lines.push("", `Download your invoice: ${input.invoiceLink}`);
  }

  lines.push("", "We look forward to serving you again.", `- ${STORE_NAME}`);
  return lines.join("\n");
}

/** Compose the wa.me click-to-chat URL with the message URL-encoded. */
export function buildWhatsAppShareUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
