-- Product brand + variant list price (catalog / POS defaults)

ALTER TABLE "products" ADD COLUMN "brand" TEXT;

ALTER TABLE "product_variants" ADD COLUMN "list_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
