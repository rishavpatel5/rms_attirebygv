/** Indian Standard Time helpers for the web app (UTC+5:30). */
export const IST_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar YYYY-MM-DD for the given instant in IST (default: now). */
export function istYmd(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inclusive IST range ending today (default 30 days). */
export function rollingIstDaysRange(days: number): { from: string; to: string } {
  const to = istYmd();
  const end = new Date(`${to}T00:00:00+05:30`);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { from: istYmd(start), to };
}

/** Prior window of the same length immediately before `from` (IST calendar days). */
export function priorIstWindow(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(`${to}T00:00:00+05:30`);
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * 86_400_000);
  return { from: istYmd(prevStart), to: istYmd(prevEnd) };
}

export function lastSixIstMonthsRange(): { from: string; to: string } {
  const to = istYmd();
  const shifted = new Date(Date.now() + IST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  let fromY = y;
  let fromM = m - 5;
  while (fromM < 0) {
    fromM += 12;
    fromY -= 1;
  }
  const from = `${fromY}-${String(fromM + 1).padStart(2, "0")}-01`;
  return { from, to };
}

export function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: IST_TIMEZONE,
  });
}

export function formatIstDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    dateStyle: "medium",
    timeZone: IST_TIMEZONE,
  });
}

export function monthLabelIst(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { month: "short", timeZone: IST_TIMEZONE });
}
