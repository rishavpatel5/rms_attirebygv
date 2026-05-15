import type { serializeOrderForReport } from "../orders-report.serializer.js";

/** Canonical invoice view — all amounts are persisted order fields, never recalculated. */
export type InvoiceDocument = ReturnType<typeof serializeOrderForReport>;
