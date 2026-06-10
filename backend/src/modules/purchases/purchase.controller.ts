import type { Request, Response } from "express";
import { getQueryRecord, parseBody } from "../../lib/http-parse.js";
import * as purchaseService from "./purchase.service.js";
import {
  createPurchaseOrderBodySchema,
  receivePurchaseBodySchema,
  recordPurchasePaymentBodySchema,
  replacePurchaseLinesBodySchema,
  updatePurchaseOrderBodySchema,
} from "./purchase.validators.js";

const saveAndReceiveBodySchema = createPurchaseOrderBodySchema.extend({
  lines: replacePurchaseLinesBodySchema.shape.lines,
});

export const purchaseController = {
  async list(req: Request, res: Response): Promise<void> {
    const out = await purchaseService.listPurchaseOrders(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async get(req: Request, res: Response): Promise<void> {
    const row = await purchaseService.getPurchaseOrderById(req.params.id!);
    res.json({ data: row });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = parseBody(createPurchaseOrderBodySchema, req.body);
    const row = await purchaseService.createPurchaseOrder({
      ...body,
      createdById: req.auth?.userId ?? null,
    });
    res.status(201).json({ data: row });
  },

  async update(req: Request, res: Response): Promise<void> {
    const body = parseBody(updatePurchaseOrderBodySchema, req.body);
    const row = await purchaseService.updatePurchaseOrderHeader(req.params.id!, body);
    res.json({ data: row });
  },

  async replaceLines(req: Request, res: Response): Promise<void> {
    const body = parseBody(replacePurchaseLinesBodySchema, req.body);
    const row = await purchaseService.replacePurchaseLines(req.params.id!, body);
    res.json({ data: row });
  },

  async submit(req: Request, res: Response): Promise<void> {
    const row = await purchaseService.markPurchaseOrdered(
      req.params.id!,
      req.auth?.userId ?? null,
    );
    res.json({ data: row });
  },

  async receive(req: Request, res: Response): Promise<void> {
    const body = parseBody(receivePurchaseBodySchema, req.body);
    const row = await purchaseService.receivePurchase(
      req.params.id!,
      body,
      req.auth?.userId ?? null,
    );
    res.json({ data: row });
  },

  async saveAndReceive(req: Request, res: Response): Promise<void> {
    const body = parseBody(saveAndReceiveBodySchema, req.body);
    const { supplierId, lines } = body;
    const row = await purchaseService.saveAndReceivePurchase({
      supplierId,
      lines,
      createdById: req.auth?.userId ?? null,
    });
    res.status(201).json({ data: row });
  },

  async recordPayment(req: Request, res: Response): Promise<void> {
    const body = parseBody(recordPurchasePaymentBodySchema, req.body);
    const row = await purchaseService.recordPurchasePayment(
      req.params.id!,
      body.amount,
    );
    res.json({ data: row });
  },
};
