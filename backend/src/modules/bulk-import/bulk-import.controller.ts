import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import {
  scanImportFile,
  commitImport,
  commitCatalog,
  commitStock,
  listBatches,
  rollbackBatch,
} from "./bulk-import.service.js";
import type { CommitRequest } from "./bulk-import.service.js";

export async function handleScan(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new AppError(400, "FILE_REQUIRED", "Upload a .xlsx file");
  const result = await scanImportFile(file.buffer);
  res.json({ data: result });
}

export async function handleCommit(req: Request, res: Response): Promise<void> {
  const createdById = (req as Request & { user?: { id: string } }).user?.id ?? null;
  const body = req.body as CommitRequest;
  if (!body?.rows?.length) throw new AppError(400, "EMPTY_PAYLOAD", "No rows to commit");
  const result = await commitImport(body, createdById);
  res.json({ data: result });
}

// Step 1 — create catalog only (products/variants), no stock.
export async function handleCommitCatalog(req: Request, res: Response): Promise<void> {
  const createdById = (req as Request & { user?: { id: string } }).user?.id ?? null;
  const body = req.body as CommitRequest;
  if (!body?.rows?.length) throw new AppError(400, "EMPTY_PAYLOAD", "No rows to commit");
  const result = await commitCatalog(body, createdById);
  res.json({ data: result });
}

// Step 2 — receive stock against a catalog batch created in step 1.
export async function handleCommitStock(req: Request, res: Response): Promise<void> {
  const receivedById = (req as Request & { user?: { id: string } }).user?.id ?? null;
  const body = req.body as CommitRequest & { batchId?: string };
  if (!body?.batchId) throw new AppError(400, "BATCH_REQUIRED", "Missing batchId from the catalog step");
  if (!body?.rows?.length) throw new AppError(400, "EMPTY_PAYLOAD", "No rows to commit");
  const result = await commitStock(body.batchId, body, receivedById);
  res.json({ data: result });
}

export async function handleListBatches(_req: Request, res: Response): Promise<void> {
  const result = await listBatches();
  res.json({ data: result });
}

export async function handleRollback(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const rolledBackById = (req as Request & { user?: { id: string } }).user?.id ?? null;
  const result = await rollbackBatch(id, rolledBackById);
  res.json({ data: result });
}
