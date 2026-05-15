import type { Request, Response } from "express";
import { getQueryRecord } from "../../lib/http-parse.js";
import * as offerService from "./offer.service.js";

export const offerController = {
  async list(req: Request, res: Response): Promise<void> {
    const out = await offerService.listOffers(getQueryRecord(req));
    res.json({ data: out.items, meta: out.meta });
  },
};
