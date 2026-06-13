/** Indian Standard Time — fixed offset UTC+5:30 (no DST). */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const IST_TIMEZONE = "Asia/Kolkata";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar YYYY-MM-DD for the given instant in IST (default: now). */
export function istYmd(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function istYear(d: Date = new Date()): number {
  return Number(istYmd(d).slice(0, 4));
}

export function isValidIstDay(ymd: string): boolean {
  if (!DAY_RE.test(ymd)) return false;
  const start = new Date(`${ymd}T00:00:00+05:30`);
  return !Number.isNaN(start.getTime()) && istYmd(start) === ymd;
}

/** Inclusive IST calendar-day range as UTC instants `[start, endExclusive)`. */
export function parseIstDayRange(from: string, to: string): { start: Date; endExclusive: Date } {
  if (!isValidIstDay(from) || !isValidIstDay(to)) {
    throw new Error("INVALID_DATE");
  }
  const start = new Date(`${from}T00:00:00+05:30`);
  const endExclusive = new Date(`${to}T00:00:00+05:30`);
  endExclusive.setTime(endExclusive.getTime() + 86_400_000);
  if (endExclusive <= start) {
    throw new Error("INVALID_RANGE");
  }
  return { start, endExclusive };
}

/**
 * POS sale timestamp: selected IST calendar day at the current IST wall-clock time.
 * When `saleDate` is omitted, uses today's IST date.
 */
export function resolveSaleConfirmedAt(saleDate?: string | null, now: Date = new Date()): Date {
  const ymd = saleDate?.trim() || istYmd(now);
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const m = String(shifted.getUTCMinutes()).padStart(2, "0");
  const s = String(shifted.getUTCSeconds()).padStart(2, "0");
  const ms = String(shifted.getUTCMilliseconds()).padStart(3, "0");
  return new Date(`${ymd}T${h}:${m}:${s}.${ms}+05:30`);
}
