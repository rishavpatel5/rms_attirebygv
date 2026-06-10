# Phase 2 — Database design

This document explains the Prisma schema in `backend/prisma/schema.prisma`: **relationships**, **indexes** (including optional SQL beyond Prisma), and **transaction patterns** for inventory-safe workflows.

## Design principles

1. **Sellable unit** = `ProductVariant` (SKU-level). Simple accessories use optional `colorId` / `sizeId` (e.g. seed a `ONE` size and a `Default` color, or leave both null if policy allows—enforce in application validation if you require non-null for apparel only).
2. **Inventory truth** = `InventoryBalance.quantity` updated **only** inside the same database transaction as an append-only `InventoryLog` row (`quantityDelta`: positive = in, negative = out).
3. **Commercial truth** = `Order` + `OrderItem` + `Payment`. Reports aggregate these tables; **GST and line money are stored on the order/line**, not recomputed from global settings later.
4. **Polymorphic references** on `InventoryLog` use `referenceKind` + `referenceId` (string id). This stays portable to Supabase Postgres.
5. **No duplicate “report tables”** for sales: derive analytics from `orders` / `order_items` / `payments` / `inventory_logs`.

---

## Entity relationships (conceptual)

### Catalog

- `Category` self-references for optional hierarchy (`parentId`).
- `Product` belongs to one `Category`; has many `ProductVariant`.
- `ProductVariant` belongs to `Product`; optional `Color` and `Size` for apparel matrix; **`sku` globally unique**.
- `Color` / `Size` are shared lookup tables so CRM and filters stay normalized.

### Inventory

- Each variant has at most one `InventoryBalance` row (`variantId` PK) holding **current quantity** (cache row for locking + fast reads).
- `InventoryLog` is **append-only** in application code: every stock change writes one row with `quantityDelta`, `movementType`, and `referenceKind` + `referenceId` pointing to the business document (`ORDER`, `PURCHASE_ORDER`, `SALES_RETURN`, `EXCHANGE`, `STOCK_ADJUSTMENT`).
- `StockAdjustment` is the document for manual shrinkage/damage/corrections; logs reference it with `InventoryReferenceKind.STOCK_ADJUSTMENT`.

### CRM

- `Customer` optional `phone` / `email` unique; JSON fields for preferences (`preferredCategories`, `preferredSizes`) keep schema flexible until you normalize further.

### Purchasing

- `Supplier` has many `PurchaseOrder`.
- `PurchaseOrderItem` lines target a `ProductVariant` with `quantityOrdered`, `quantityReceived`, and `unitCost` (valuation / COGS inputs for reports).

### Sales & GST

- `Order` supports `documentType`: **`SALE`** or **`CREDIT_NOTE`**. Credit notes reference the original sale via `originalSaleId`.
- **GST per invoice**: `gstEnabled`, `gstPricingMode` (`INCLUSIVE` | `EXCLUSIVE`) on `Order`; **totals** stored on the order. Each `OrderItem` stores line-level **taxable value**, **rates**, component amounts, and **line total** as persisted snapshots.
- **Credit notes**: for `documentType = CREDIT_NOTE`, either store **negative** `lineTotal` / tax component fields on `OrderItem` so `SUM(line_total)` by date is net sales, or store positive values and always filter by `documentType` in reports—pick one convention in the billing service and never mix.
- `Order` has optional `customerId`, optional `offerId`, optional `idempotencyKey` (unique) for POS idempotency.
- `Payment` rows belong to an `Order`; `nature` = `RECEIPT` (money in) or `REFUND` (money out). Multiple payments per order supported.

### Offers

- `Offer` defines rules; `OfferProduct` scopes an offer to specific products (extend later with category/global scopes if needed).

### Returns & exchanges

- `SalesReturn` references the **original** `Order` (the sale). Status workflow: `REQUESTED` → `APPROVED` → `COMPLETED` / `REJECTED` / `CANCELLED`.
- `SalesReturnLine` references `OrderItem` + `quantity` + `disposition` (`RESTOCK` | `NO_RESTOCK`). **Inventory**: only `RESTOCK` produces `InventoryLog` with `RETURN_RESTOCK_IN` (positive delta). `NO_RESTOCK` is audit-only on the return line (no stock movement).
- `Exchange` links `originalOrderId`, optional `newOrderId` (replacement sale when completed), optional `salesReturnId` (1:1 optional link for the return leg), and `status`.

### Notifications & WhatsApp

- `Notification` is staff-facing (`userId` → `User`), in-app channel for now (`NotificationChannel` expandable later).
- `WhatsAppLog` stores outbound attempts: `toPhone`, template name, payload JSON, provider ids, status lifecycle, optional `customerId` / `orderId`.

### Staff

- `User` exists for audit FKs (`createdById` on orders, purchase orders, inventory logs, stock adjustments). Phase 3 wires authentication.

---

## Indexing recommendations

### Already declared in Prisma (`@@index`)

High-value composite indexes are on: `inventory_logs` (variant + time, reference, time), `orders` (type/status/time, customer/time), `order_items` (order, variant/time), `payments` (order + nature, time), `whatsapp_logs` (status/time, customer/time), purchase/return/exchange tables for operational queries.

### Additional SQL indexes (add in migrations when query plans show need)

- **Invoice lookup**: you already have `invoiceNumber` `@unique` on `orders`.
- **Heavy reporting** (optional later): BRIN on `orders.created_at` / `inventory_logs.created_at` for very large tables on low-cost disks.

Avoid redundant indexes that duplicate `@unique` columns unless queries need composite ordering differently.

---

## Transaction flow recommendations

All flows below should use **`prisma.$transaction`** (interactive transaction recommended when you need to read-then-write with locks).

### A) Confirm sale (`Order` `SALE`, status → `CONFIRMED`)

1. **Lock** variant stock rows: `SELECT … FROM inventory_balances WHERE variant_id IN (…) FOR UPDATE` (via `findMany` + `update` inside transaction or raw query).
2. Verify each line’s `quantity` ≤ `inventory_balances.quantity`.
3. Insert/update: `orders` + `order_items` + `payments` (if you record payment at confirm).
4. For each line: insert `inventory_logs` (`SALE_OUT`, negative `quantityDelta`, `referenceKind` = `ORDER`, `referenceId` = order id); decrement `inventory_balances.quantity`.
5. Commit. **Never** update balance without a matching log in the same transaction.

**Void / same-day cancel (if allowed):** reverse with `SALE_REVERSAL_IN` logs and positive deltas, flip `Order.status` to `VOIDED`, and reverse payments or create `REFUND` payments per policy—all in one transaction.

### B) Receive purchase (`PurchaseOrder`)

1. For each line being received: increase `quantityReceived` (partial allowed).
2. For the incremental received qty: `inventory_logs` (`PURCHASE_IN`, positive delta, reference `PURCHASE_ORDER` + purchase order id or line id in `metadata` / `referenceId` as PO id consistently).
3. Update `inventory_balances`.
4. Update PO status to `PARTIALLY_RECEIVED` / `RECEIVED`.

Use one transaction per receive batch.

### C) Complete `SalesReturn` with restock

1. Validate lines against original `OrderItem` quantities already not returned.
2. For each line with `RESTOCK`: `inventory_logs` (`RETURN_RESTOCK_IN`, positive delta, `referenceKind` = `SALES_RETURN`, `referenceId` = return id); update balance.
3. Set `SalesReturn.status` = `COMPLETED`, timestamps.
4. Optionally create `CREDIT_NOTE` `Order` + `Payment` `REFUND` in the **same** transaction if refunds are instant—otherwise separate financial transaction with clear linkage via `originalSaleId`.

### D) `Exchange` (typical)

1. Create `Exchange` (`OPEN`), optional `SalesReturn` + lines.
2. On completion: process return leg (stock as in C if restock), create **`newOrderId`** `SALE` for replacement items (same checkout pipeline as A), link `Exchange.status` = `COMPLETED`. All one transaction if possible, or **saga** with compensating steps if external payment is async (do not finalize stock until payment rules are satisfied).

### E) `StockAdjustment` (damage / shrinkage)

1. Insert `stock_adjustments`.
2. Insert `inventory_logs` (`DAMAGE_OUT` / `ADJUSTMENT_OUT` / `ADJUSTMENT_IN` as appropriate) with `referenceKind` = `STOCK_ADJUSTMENT`.
3. Update `inventory_balances`.

### F) WhatsApp / notifications

- Never block sales transactions on WhatsApp. Insert `whatsapp_logs` as `QUEUED` in a **separate** short transaction or async worker; update status when the Cloud API responds.

### G) Idempotency

- POS confirm: if `idempotencyKey` already exists on an `Order`, return the existing order (HTTP 200/409 policy is your choice)—enforce **unique** constraint at DB level (already on `orders.idempotency_key`).

---

## GST calculation (application responsibility)

The schema stores **results** per invoice and line. Application services must:

- Respect `order.gstEnabled` and `order.gstPricingMode` when building lines.
- Persist rounded line amounts and order totals **once** at confirmation.
- Use `CREDIT_NOTE` orders for post-sale adjustments so analytics can net `SALE` vs `CREDIT_NOTE` by `originalSaleId` where needed.

---

## Migrations

From `backend` with a real `DATABASE_URL`:

```bash
npx prisma migrate dev --name phase2_core_schema
```

For production / Supabase:

```bash
npx prisma migrate deploy
```

This schema uses standard PostgreSQL types only (`Json`, `Decimal`, enums), which migrates cleanly to **Supabase Postgres** when you point `DATABASE_URL` at the pooler or direct connection string.
