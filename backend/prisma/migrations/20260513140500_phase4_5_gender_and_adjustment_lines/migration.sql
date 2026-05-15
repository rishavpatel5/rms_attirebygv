-- Phase 4/5: product gender + stock adjustment lines (multi-line adjustments)

CREATE TYPE "ProductGender" AS ENUM ('MENS', 'WOMENS', 'UNISEX', 'KIDS', 'NOT_APPLICABLE');

ALTER TABLE "products" ADD COLUMN "gender" "ProductGender" NOT NULL DEFAULT 'UNISEX';

CREATE INDEX "products_gender_idx" ON "products"("gender");

CREATE TABLE "stock_adjustment_lines" (
    "id" TEXT NOT NULL,
    "stock_adjustment_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "movement_type" "InventoryMovementType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustment_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_adjustment_lines_stock_adjustment_id_idx" ON "stock_adjustment_lines"("stock_adjustment_id");

CREATE INDEX "stock_adjustment_lines_variant_id_idx" ON "stock_adjustment_lines"("variant_id");

ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_stock_adjustment_id_fkey" FOREIGN KEY ("stock_adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
