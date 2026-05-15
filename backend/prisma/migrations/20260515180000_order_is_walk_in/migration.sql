-- Anonymous POS sales vs CRM-linked orders
ALTER TABLE "orders" ADD COLUMN "is_walk_in" BOOLEAN NOT NULL DEFAULT false;

UPDATE "orders"
SET "is_walk_in" = true
WHERE "customer_id" IS NULL
  AND "document_type" = 'SALE';
