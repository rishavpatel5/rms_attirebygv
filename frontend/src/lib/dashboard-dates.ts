export function utcYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive UTC range ending today (default 30 days). */
export function rollingDaysRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: utcYmd(from), to: utcYmd(to) };
}

/** Prior window of the same length immediately before `from`. */
export function priorWindow(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (spanDays - 1));
  return { from: utcYmd(prevStart), to: utcYmd(prevEnd) };
}

export function lastSixMonthsRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  from.setUTCMonth(from.getUTCMonth() - 5);
  return { from: utcYmd(from), to: utcYmd(to) };
}

export function formatRelativePast(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 86400 * 56) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
}
