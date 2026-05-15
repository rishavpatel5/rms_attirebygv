import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { getQueryRecord, parseBody } from "../../lib/http-parse.js";
import * as customerService from "./customer.service.js";
import {
  createCustomerBodySchema,
  updateCustomerBodySchema,
} from "./customer.validators.js";

export const customerController = {
  async posSearch(req: Request, res: Response): Promise<void> {
    const q = getQueryRecord(req).q;
    const limitRaw = getQueryRecord(req).limit;
    const qStr = typeof q === "string" ? q : "";
    let limit = 12;
    if (typeof limitRaw === "string" && /^\d+$/.test(limitRaw)) {
      limit = Number(limitRaw);
    } else if (typeof limitRaw === "number" && Number.isFinite(limitRaw)) {
      limit = Math.floor(limitRaw);
    }
    if (qStr.length > 80) {
      throw new AppError(400, "QUERY_TOO_LONG", "Search query is too long");
    }
    const rows = await customerService.searchCustomersForPos(qStr, limit);
    res.json({ data: rows });
  },

  async list(req: Request, res: Response): Promise<void> {
    const out = await customerService.listCustomers(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async get(req: Request, res: Response): Promise<void> {
    const row = await customerService.getCustomerById(req.params.id!);
    res.json({ data: row });
  },

  async listOrders(req: Request, res: Response): Promise<void> {
    const out = await customerService.listCustomerOrders(
      req.params.id!,
      getQueryRecord(req),
    );
    res.json({ data: out.items, meta: out.meta });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = parseBody(createCustomerBodySchema, req.body);
    const row = await customerService.createCustomer(body);
    res.status(201).json({ data: row });
  },

  async update(req: Request, res: Response): Promise<void> {
    const body = parseBody(updateCustomerBodySchema, req.body);
    const row = await customerService.updateCustomer(req.params.id!, body);
    res.json({ data: row });
  },
};
