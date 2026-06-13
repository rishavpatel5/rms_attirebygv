import { AppError } from "../../middleware/error-handler.js";
import { isValidIstDay, parseIstDayRange as parseRange } from "../../lib/ist-time.js";

/** Inclusive `from` / `to` calendar days in IST; queries use `[start, endExclusive)`. */
export function parseIstDayRange(from: string, to: string): { start: Date; endExclusive: Date } {
  try {
    return parseRange(from, to);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INVALID_RANGE") {
      throw new AppError(400, "INVALID_RANGE", "`to` must be on or after `from`");
    }
    throw new AppError(400, "INVALID_DATE", "Invalid date range");
  }
}

export function assertValidIstSaleDate(ymd: string): void {
  if (!isValidIstDay(ymd)) {
    throw new AppError(400, "INVALID_SALE_DATE", "saleDate must be YYYY-MM-DD in IST");
  }
}
