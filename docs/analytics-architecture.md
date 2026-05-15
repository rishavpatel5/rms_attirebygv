# Analytics & reports architecture (RMS)

## Principles

1. **Single source of truth** — All monetary and quantity KPIs are derived from transactional tables (`orders`, `order_items`, `payments`, `purchase_order_items`, `inventory_balances`). There are no duplicate materialized aggregates in this phase.
2. **One definition of “sale activity”** — Confirmed sale invoices use `orders.document_type = SALE`, `orders.status = CONFIRMED`, and `orders.confirmed_at` for time bucketing. Confirmed credit notes use `CREDIT_NOTE` + `CONFIRMED` on the same timestamp column so **net sales** in a period are `gross sales − credit notes` without double-counting line tables for headline revenue.
3. **COGS & inventory value** — **Weighted-average unit cost (WAC)** is computed per `variant_id` from received purchase lines only (`purchase_order_items.quantity_received > 0`). That CTE is reused conceptually across profit and valuation queries so cost logic stays aligned. Variants with no purchase history contribute **zero** COGS/valuation cost until goods are received at cost.
4. **SQL-first for rollups** — Time buckets use PostgreSQL `date_trunc` with a whitelisted granularity (`day` / `week` / `month`) to avoid dynamic SQL injection and to let the planner use indexes (including `orders_confirmed_at_idx`).
5. **API shape** — Read endpoints live under `/api/v1/analytics/*`, require `Authorization: Bearer <access JWT>`, and reuse the shared pagination helper for list-style reports.

## Endpoint map

| Report | Method | Path |
|--------|--------|------|
| Daily / weekly / monthly sales | GET | `/analytics/sales-series` |
| Profit totals | GET | `/analytics/profit/summary` |
| Profit line detail | GET | `/analytics/profit/lines` |
| Inventory valuation | GET | `/analytics/inventory-valuation` |
| Fast-moving SKUs | GET | `/analytics/fast-moving` |
| Dead stock | GET | `/analytics/dead-stock` |
| Customer retention | GET | `/analytics/customer-retention` |
| Offer performance | GET | `/analytics/offer-performance` |

Shared optional filters on range-based endpoints: `customerId`, `categoryId` (orders touching that category).

## Frontend

The web app loads charts with **Recharts** and calls the analytics API via a thin client that attaches `Bearer` tokens from `localStorage` key `rms_access_token` when present (same key a future login UI can write).
