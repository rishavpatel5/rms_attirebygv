-- Variant pricing & GST defaults (selling side)
ALTER TABLE "product_variants" ADD COLUMN "cost_price" DECIMAL(12,2),
ADD COLUMN "gst_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "gst_pricing_mode" "GstPricingMode" NOT NULL DEFAULT 'INCLUSIVE',
ADD COLUMN "cgst_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN "sgst_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN "igst_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN "low_stock_threshold" INTEGER;

UPDATE "product_variants" pv
SET
  "cgst_rate" = CASE WHEN p.kind = 'APPAREL' THEN 2.5 ELSE 9 END,
  "sgst_rate" = CASE WHEN p.kind = 'APPAREL' THEN 2.5 ELSE 9 END,
  "igst_rate" = 0
FROM "products" p
WHERE p.id = pv.product_id;

-- Purchase document totals & supplier balance tracking
ALTER TABLE "purchase_orders" ADD COLUMN "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxable_value_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "cgst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "sgst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "igst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "grand_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Purchase lines: GST + normalized exclusive unit cost for WAC
ALTER TABLE "purchase_order_items" ADD COLUMN "gst_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "gst_pricing_mode" "GstPricingMode" NOT NULL DEFAULT 'EXCLUSIVE',
ADD COLUMN "cgst_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN "sgst_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN "igst_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN "line_discount" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "taxable_value" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "cgst_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "sgst_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "igst_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "line_total" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "unit_cost_exclusive" DECIMAL(14,6) NOT NULL DEFAULT 0;

UPDATE "purchase_order_items"
SET
  "gst_enabled" = false,
  "gst_pricing_mode" = 'EXCLUSIVE',
  "cgst_rate" = 0,
  "sgst_rate" = 0,
  "igst_rate" = 0,
  "line_discount" = 0,
  "taxable_value" = ("quantity_ordered"::numeric * "unit_cost"::numeric)::decimal(14,4),
  "cgst_amount" = 0,
  "sgst_amount" = 0,
  "igst_amount" = 0,
  "line_total" = ("quantity_ordered"::numeric * "unit_cost"::numeric)::decimal(14,4),
  "unit_cost_exclusive" = "unit_cost"::decimal(14,6);

UPDATE "purchase_orders" po
SET
  "subtotal" = COALESCE(agg.sub, 0),
  "taxable_value_total" = COALESCE(agg.tax, 0),
  "grand_total" = COALESCE(agg.tot, 0)
FROM (
  SELECT
    "purchase_order_id",
    SUM("quantity_ordered"::numeric * "unit_cost"::numeric)::decimal(14,2) AS sub,
    SUM("taxable_value")::decimal(14,2) AS tax,
    SUM("line_total")::decimal(14,2) AS tot
  FROM "purchase_order_items"
  GROUP BY "purchase_order_id"
) agg
WHERE po.id = agg."purchase_order_id";
