export {
  formatIstDate,
  formatIstDateTime,
  istYmd,
  lastSixIstMonthsRange as lastSixMonthsRange,
  monthLabelIst as monthLabel,
  priorIstWindow as priorWindow,
  rollingIstDaysRange as rollingDaysRange,
} from "./ist-time";

export function formatRelativePast(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 86400 * 56) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}
