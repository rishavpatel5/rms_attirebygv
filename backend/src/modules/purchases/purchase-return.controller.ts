import type { Request, Response } from "express";
import { getAuthUserId, getQueryRecord, parseBody } from "../../lib/http-parse.js";
import * as service from "./purchase-return.service.js";
import {
  createPurchaseReturnSchema,
  previewPurchaseReturnSchema,
} from "./purchase-return.validators.js";

export const purchaseReturnController = {
  async preview(req: Request, res: Response): Promise<void> {
    const body = parseBody(previewPurchaseReturnSchema, req.body);
    const out = await service.previewPurchaseReturn(body);
    res.json({ data: out });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = parseBody(createPurchaseReturnSchema, req.body);
    const out = await service.createPurchaseReturn({ body, createdById: getAuthUserId(req) });
    res.status(201).json({ data: out });
  },

  async searchStock(req: Request, res: Response): Promise<void> {
    const out = await service.searchSupplierStock(getQueryRecord(req));
    res.json({ data: out });
  },

  async list(req: Request, res: Response): Promise<void> {
    const out = await service.listPurchaseReturns(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async get(req: Request, res: Response): Promise<void> {
    const out = await service.getPurchaseReturn(req.params.id!);
    res.json({ data: out });
  },
};
