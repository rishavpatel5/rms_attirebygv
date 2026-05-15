-- Retail discount engine: item + cart discount metadata on orders / order_items

CREATE TYPE "RetailDiscountType" AS ENUM ('PERCENT', 'FLAT_AMOUNT');

ALTER TABLE "orders"
  ADD COLUMN "item_discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cart_discount_type" "RetailDiscountType",
  ADD COLUMN "cart_discount_value" DECIMAL(14,4),
  ADD COLUMN "cart_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "order_items"
  ADD COLUMN "item_discount_type" "RetailDiscountType",
  ADD COLUMN "item_discount_value" DECIMAL(14,4),
  ADD COLUMN "item_discount_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "cart_discount_allocated" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- Backfill item discount from legacy line_discount (cart allocation was not tracked before)
UPDATE "order_items"
SET "item_discount_amount" = "line_discount"
WHERE "item_discount_amount" = 0 AND "line_discount" > 0;

UPDATE "order_items"
SET "line_discount" = "item_discount_amount" + "cart_discount_allocated";

-- Order-level item discount rollup from lines (confirmed/draft sales)
UPDATE "orders" o
SET "item_discount_total" = COALESCE((
  SELECT SUM(oi.item_discount_amount)::numeric(14,2)
  FROM "order_items" oi
  WHERE oi.order_id = o.id
), 0);
