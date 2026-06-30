import type { Request, Response } from "express";
import { getQueryRecord, parseBody } from "../../lib/http-parse.js";
import * as capitalService from "./capital.service.js";
import {
  createCapitalEntryBodySchema,
  setOpeningCashBodySchema,
  updateCapitalEntryBodySchema,
} from "./capital.validators.js";

export const capitalController = {
  async list(req: Request, res: Response): Promise<void> {
    const out = await capitalService.listCapitalEntries(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = parseBody(createCapitalEntryBodySchema, req.body);
    const row = await capitalService.createCapitalEntry(body);
    res.status(201).json({ data: row });
  },

  async update(req: Request, res: Response): Promise<void> {
    const body = parseBody(updateCapitalEntryBodySchema, req.body);
    const row = await capitalService.updateCapitalEntry(req.params.id!, body);
    res.json({ data: row });
  },

  async remove(req: Request, res: Response): Promise<void> {
    await capitalService.deleteCapitalEntry(req.params.id!);
    res.status(204).send();
  },

  async position(_req: Request, res: Response): Promise<void> {
    const out = await capitalService.getBusinessPosition();
    res.json({ data: out });
  },

  async setOpeningCash(req: Request, res: Response): Promise<void> {
    const body = parseBody(setOpeningCashBodySchema, req.body);
    const out = await capitalService.setOpeningCash(body.cashInHand);
    res.status(201).json({ data: out });
  },
};
