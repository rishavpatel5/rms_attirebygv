-- CreateEnum
CREATE TYPE "BulkImportBatchStatus" AS ENUM ('COMPLETED', 'ROLLED_BACK');

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "bulk_import_batch_id" TEXT;

-- CreateTable
CREATE TABLE "bulk_import_batches" (
    "id" TEXT NOT NULL,
    "status" "BulkImportBatchStatus" NOT NULL DEFAULT 'COMPLETED',
    "rows_imported" INTEGER NOT NULL,
    "created_by_id" TEXT,
    "rolled_back_at" TIMESTAMP(3),
    "rolled_back_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulk_import_batches_created_at_idx" ON "bulk_import_batches"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_bulk_import_batch_id_fkey" FOREIGN KEY ("bulk_import_batch_id") REFERENCES "bulk_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_import_batches" ADD CONSTRAINT "bulk_import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_import_batches" ADD CONSTRAINT "bulk_import_batches_rolled_back_by_id_fkey" FOREIGN KEY ("rolled_back_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
