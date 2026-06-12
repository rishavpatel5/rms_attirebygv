-- Giveaway / free-product lines on sale orders
ALTER TABLE "order_items"
  ADD COLUMN "is_giveaway" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "unit_cost_snapshot" DECIMAL(14,4),
  ADD COLUMN "giveaway_reason" TEXT;
