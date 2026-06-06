import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type Tx = Prisma.TransactionClient;

const DEFAULT_OPTIONS: Prisma.TransactionOptions = {
  maxWait: 10_000,
  timeout: 30_000,
};

/** Interactive transaction with sane timeouts (checkout, inventory, billing). */
export function runInTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options?: Prisma.TransactionOptions,
): Promise<T> {
  return prisma.$transaction(fn, { ...DEFAULT_OPTIONS, ...options });
}
