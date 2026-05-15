-- AlterTable
ALTER TABLE "invoice_sequence" ALTER COLUMN "id" SET DEFAULT 'singleton',
ALTER COLUMN "next_seq" SET DEFAULT 0;
