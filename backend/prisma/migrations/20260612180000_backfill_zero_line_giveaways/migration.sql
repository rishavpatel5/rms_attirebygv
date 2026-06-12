-- Treat historical ₹0 sale lines as giveaways and freeze their cost snapshot.
WITH wac AS (
  SELECT
    variant_id,
    CASE
      WHEN SUM(quantity_received::numeric) > 0 THEN
        SUM(quantity_received::numeric * unit_cost_exclusive::numeric)
        / NULLIF(SUM(quantity_received::numeric), 0)
      ELSE NULL
    END AS unit_cost_wac
  FROM purchase_order_items
  WHERE quantity_received > 0
  GROUP BY variant_id
)
UPDATE order_items oi
SET
  is_giveaway = true,
  unit_cost_snapshot = COALESCE(
    oi.unit_cost_snapshot,
    w.unit_cost_wac,
    pv.cost_price,
    0::numeric
  )
FROM product_variants pv
LEFT JOIN wac w ON w.variant_id = pv.id
WHERE pv.id = oi.variant_id
  AND oi.line_total = 0
  AND oi.is_giveaway = false;
