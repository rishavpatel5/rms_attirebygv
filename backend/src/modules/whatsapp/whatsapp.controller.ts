import type { Request, Response } from "express";
import { getAuthUserId, getQueryRecord } from "../../lib/http-parse.js";
import { sendInvoiceForOrder } from "./whatsapp.service.js";

export const whatsappController = {
  async sendInvoice(req: Request, res: Response): Promise<void> {
    const bodyForce = (req.body as { force?: unknown } | undefined)?.force === true;
    const queryForce = getQueryRecord(req).force === "true";
    const out = await sendInvoiceForOrder({
      orderId: req.params.orderId!,
      sentById: getAuthUserId(req),
      force: bodyForce || queryForce,
    });
    res.json({ data: out });
  },
};
