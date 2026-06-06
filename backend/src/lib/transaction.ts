import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type Tx = Prisma.TransactionClient;

/** Prisma 6.x transaction options (TransactionOptions type is Prisma 7+). */
type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

const DEFAULT_OPTIONS: TransactionOptions = {
  maxWait: 10_000,
  timeout: 30_000,
};

/** Interactive transaction with sane timeouts (checkout, inventory, billing). */
export function runInTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return prisma.$transaction(fn, { ...DEFAULT_OPTIONS, ...options });
}
