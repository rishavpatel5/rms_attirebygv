/**
 * Normalize a phone number to WhatsApp/WATI format: country code + number, digits only,
 * no "+", spaces, or separators. Returns null when the number is unusable.
 * Mirrors the frontend helper in `whatsapp-invoice.ts` so both sides agree.
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
