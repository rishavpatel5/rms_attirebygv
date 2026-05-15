import { AppError } from "../../middleware/error-handler.js";

/** Inclusive `from` / `to` calendar days in UTC; analytics queries use `[start, endExclusive)`. */
export function parseUtcDayRange(from: string, to: string): { start: Date; endExclusive: Date } {
  const start = new Date(`${from}T00:00:00.000Z`);
  const endDay = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endDay.getTime())) {
    throw new AppError(400, "INVALID_DATE", "Invalid date range");
  }
  if (endDay < start) {
    throw new AppError(400, "INVALID_RANGE", "`to` must be on or after `from`");
  }
  const endExclusive = new Date(endDay);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive };
}
