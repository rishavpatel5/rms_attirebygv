-- CreateEnum
CREATE TYPE "PurchaseReturnStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseReturnSettlement" AS ENUM ('CASH', 'BANK', 'UPI');

-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'PURCHASE_RETURN_OUT';

-- AlterEnum
ALTER TYPE "InventoryReferenceKind" ADD VALUE 'PURCHASE_RETURN';

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" "PurchaseReturnStatus" NOT NULL DEFAULT 'CONFIRMED',
    "book_value" DECIMAL(14,2) NOT NULL,
    "refund_amount" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "settlement_method" "PurchaseReturnSettlement" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_by_id" TEXT,
    "confirmed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_lines" (
    "id" TEXT NOT NULL,
    "purchase_return_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_wac" DECIMAL(14,6) NOT NULL,
    "line_book_value" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_idempotency_key_key" ON "purchase_returns"("idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_returns_supplier_id_created_at_idx" ON "purchase_returns"("supplier_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "purchase_returns_status_created_at_idx" ON "purchase_returns"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "purchase_return_lines_purchase_return_id_idx" ON "purchase_return_lines"("purchase_return_id");

-- CreateIndex
CREATE INDEX "purchase_return_lines_variant_id_idx" ON "purchase_return_lines"("variant_id");

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
