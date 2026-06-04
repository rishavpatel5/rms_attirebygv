import { Router } from "express";
import { generatePublicSaleInvoicePdf } from "../modules/billing/invoice/public-invoice.service.js";
import { asyncHandler } from "../utils/async-handler.js";

/** Short public links for WhatsApp: GET /i/:orderId → invoice PDF */
export const publicInvoiceRouter = Router();

publicInvoiceRouter.get(
  "/:orderId",
  asyncHandler(async (req, res) => {
    const orderId = req.params.orderId!;
    const { buffer, filename } = await generatePublicSaleInvoicePdf(orderId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  }),
);
