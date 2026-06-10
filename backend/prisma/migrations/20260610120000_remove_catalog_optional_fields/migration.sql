-- Drop product images
DROP TABLE IF EXISTS "product_images";

-- Drop optional product metadata columns
ALTER TABLE "products" DROP COLUMN IF EXISTS "description";
ALTER TABLE "products" DROP COLUMN IF EXISTS "hsn_code";
ALTER TABLE "products" DROP COLUMN IF EXISTS "fit_notes";

-- Drop variant barcode
DROP INDEX IF EXISTS "product_variants_barcode_key";
ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "barcode";
