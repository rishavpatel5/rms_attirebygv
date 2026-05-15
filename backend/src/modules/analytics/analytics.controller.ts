import type { Request, Response } from "express";
import type { z } from "zod";
import { getQueryRecord } from "../../lib/http-parse.js";
import { AppError } from "../../middleware/error-handler.js";
import * as analyticsService from "./analytics.service.js";
import {
  dateRangeQuerySchema,
  deadStockQuerySchema,
  fastMovingQuerySchema,
  inventoryValuationQuerySchema,
  offerPerformanceQuerySchema,
  ordersReportQuerySchema,
  profitLinesQuerySchema,
  salesSeriesQuerySchema,
} from "./analytics.validators.js";
import * as billingService from "../billing/billing.service.js";

function parseQuery<S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const parsed = schema.safeParse(getQueryRecord(req));
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid query", parsed.error.flatten());
  }
  return parsed.data;
}

export const analyticsController = {
  async salesSeries(req: Request, res: Response): Promise<void> {
    const q = parseQuery(salesSeriesQuerySchema, req);
    const data = await analyticsService.getSalesBuckets(q);
    res.json({ data });
  },

  async profitSummary(req: Request, res: Response): Promise<void> {
    const q = parseQuery(dateRangeQuerySchema, req);
    const data = await analyticsService.getProfitSummary(q);
    res.json({ data });
  },

  async profitLines(req: Request, res: Response): Promise<void> {
    const q = parseQuery(profitLinesQuerySchema, req);
    const out = await analyticsService.getProfitLines(q);
    res.json({ data: out.items, meta: out.meta });
  },

  async inventoryValuation(req: Request, res: Response): Promise<void> {
    const q = parseQuery(inventoryValuationQuerySchema, req);
    const out = await analyticsService.getInventoryValuation(q);
    res.json({ data: { items: out.items, totals: out.totals }, meta: out.meta });
  },

  async fastMoving(req: Request, res: Response): Promise<void> {
    const q = parseQuery(fastMovingQuerySchema, req);
    const data = await analyticsService.getFastMovingProducts(q);
    res.json({ data });
  },

  async deadStock(req: Request, res: Response): Promise<void> {
    const q = parseQuery(deadStockQuerySchema, req);
    const out = await analyticsService.getDeadStock(q);
    res.json({ data: out.items, meta: out.meta });
  },

  async customerRetention(req: Request, res: Response): Promise<void> {
    const q = parseQuery(dateRangeQuerySchema, req);
    const data = await analyticsService.getCustomerRetention(q);
    res.json({ data });
  },

  async offerPerformance(req: Request, res: Response): Promise<void> {
    const q = parseQuery(offerPerformanceQuerySchema, req);
    const out = await analyticsService.getOfferPerformance(q);
    res.json({ data: out.items, meta: out.meta });
  },

  async ordersReport(req: Request, res: Response): Promise<void> {
    const q = parseQuery(ordersReportQuerySchema, req);
    const out = await billingService.listOrdersReport(q);
    res.json({ data: out.items, meta: out.meta });
  },
};
