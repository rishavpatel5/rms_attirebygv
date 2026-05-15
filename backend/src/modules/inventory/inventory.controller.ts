import type { Request, Response } from "express";
import { getAuthUserId, getQueryRecord, parseBody } from "../../lib/http-parse.js";
import * as inventoryService from "./inventory.service.js";
import {
  mapMovementType,
  stockAdjustmentBodySchema,
} from "./inventory.validators.js";

export const inventoryController = {
  async listBalances(req: Request, res: Response): Promise<void> {
    const out = await inventoryService.listBalances(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async stockSummary(req: Request, res: Response): Promise<void> {
    const out = await inventoryService.listStockSummary(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async getBalance(req: Request, res: Response): Promise<void> {
    const row = await inventoryService.getBalanceByVariantId(
      req.params.variantId!,
    );
    res.json({ data: row });
  },

  async listLogs(req: Request, res: Response): Promise<void> {
    const out = await inventoryService.listLogs(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async createAdjustment(req: Request, res: Response): Promise<void> {
    const body = parseBody(stockAdjustmentBodySchema, req.body);
    const lines = body.lines.map((l) => ({
      variantId: l.variantId,
      quantityDelta: l.quantityDelta,
      movementType: mapMovementType(l.movementType),
    }));
    const out = await inventoryService.createStockAdjustmentWithMovements({
      reason: body.reason,
      note: body.note,
      lines,
      createdById: getAuthUserId(req),
    });
    const detail = await inventoryService.getAdjustmentById(out.adjustmentId);
    res.status(201).json({ data: detail });
  },

  async getAdjustment(req: Request, res: Response): Promise<void> {
    const row = await inventoryService.getAdjustmentById(req.params.adjustmentId!);
    res.json({ data: row });
  },

  async applyReturnRestock(req: Request, res: Response): Promise<void> {
    await inventoryService.applySalesReturnRestock({
      salesReturnId: req.params.returnId!,
      createdById: getAuthUserId(req),
    });
    res.status(204).send();
  },
};
