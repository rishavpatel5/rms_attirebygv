# Catalog (Phase 4) & Inventory engine (Phase 5)

All routes require **`Authorization: Bearer <access_token>`** unless noted otherwise.

Base paths:

- **Catalog:** `/api/v1/catalog/...`
- **Inventory:** `/api/v1/inventory/...`

## Roles

| Capability | Roles |
|------------|--------|
| Read catalog + inventory lists | `ADMIN`, `CASHIER`, `INVENTORY_MANAGER` |
| Write categories, products, variants, images, colors, sizes | `ADMIN`, `INVENTORY_MANAGER` |
| Stock adjustments + return restock apply | `ADMIN`, `INVENTORY_MANAGER` |

## Catalog API summary

| Method | Path | Description |
|--------|------|----------------|
| GET | `/catalog/categories` | Paginated list (`page`, `limit`, `parentId`, `isActive`, `search`) |
| GET | `/catalog/categories/:id` | Detail |
| POST | `/catalog/categories` | Create |
| PATCH | `/catalog/categories/:id` | Update |
| DELETE | `/catalog/categories/:id` | Delete (blocked if products or children exist) |
| GET | `/catalog/products` | List (`categoryId`, `kind`, `gender`, `isActive`, `search`) |
| POST | `/catalog/products` | Create (`gender`, `kind`, `hsnCode`, …) |
| GET | `/catalog/products/:productId` | Detail + variants + images + balances |
| PATCH | `/catalog/products/:productId` | Update |
| DELETE | `/catalog/products/:productId` | Delete or soft-deactivate if order history exists |
| GET | `/catalog/products/:productId/variants` | Paginated variants + inventory |
| POST | `/catalog/products/:productId/variants` | Create SKU (+ **creates `inventory_balances` row at 0**) |
| GET | `/catalog/variants/:variantId` | Variant detail |
| PATCH | `/catalog/variants/:variantId` | Update SKU / color / size |
| DELETE | `/catalog/variants/:variantId` | Delete (blocked if `quantity > 0`) |
| GET/POST | `/catalog/reference/colors` | List / create palette |
| GET/POST | `/catalog/reference/sizes` | List / create sizes |
| GET/POST/PATCH/DELETE | `/catalog/products/:productId/images` … | See `catalog.routes.ts` |

## Inventory API summary

| Method | Path | Description |
|--------|------|----------------|
| GET | `/inventory/balances` | Paginated (`productId`, `variantId`, `lowStock`, `threshold`) |
| GET | `/inventory/balances/:variantId` | One variant quantity + product context |
| GET | `/inventory/logs` | Paginated audit (`variantId`, `referenceKind`, `referenceId`, `from`, `to`) |
| POST | `/inventory/adjustments` | **Batch stock adjustment** (transaction): creates `stock_adjustments` + `stock_adjustment_lines` + **`inventory_logs`** + balance updates |
| GET | `/inventory/adjustments/:adjustmentId` | Read adjustment + lines |
| POST | `/inventory/returns/:returnId/apply-restock` | For **`APPROVED`** `SalesReturn`, applies **`RETURN_RESTOCK_IN`** per `RESTOCK` line, then marks return **`COMPLETED`** |

### Adjustment request body

```json
{
  "reason": "CORRECTION",
  "note": "optional",
  "lines": [
    { "variantId": "clx…", "quantityDelta": 3, "movementType": "ADJUSTMENT_IN" },
    { "variantId": "clx…", "quantityDelta": -1, "movementType": "DAMAGE_OUT" }
  ]
}
```

Allowed `movementType` on this endpoint: **`ADJUSTMENT_IN`**, **`ADJUSTMENT_OUT`**, **`DAMAGE_OUT`** only.  
`PURCHASE_IN`, `SALE_OUT`, etc. are reserved for purchase/POS flows.

## Engine rules (Phase 5)

1. **Never** update `inventory_balances` outside `inventory.service` transaction paths.
2. Every quantity change writes **`inventory_logs`** with `referenceKind` + `referenceId` (and optional `metadata`).
3. Outbound moves use `updateMany` with `quantity >= -delta` so stock cannot go negative.
4. Variants are processed **sorted by `variantId`** inside adjustments to reduce deadlock risk.
5. **Low stock:** `GET /inventory/balances?lowStock=true&threshold=5`.

## Prisma changes

- **`ProductGender`** enum + `products.gender`.
- **`stock_adjustment_lines`** — multi-line adjustments; each line still produces exactly one **`inventory_logs`** row via the engine.

Apply migrations from `backend`:

```bash
npx prisma migrate deploy
```
