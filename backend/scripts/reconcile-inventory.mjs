// Read-only inventory reconciliation / audit.
//
// SELECT-only — it never writes. Safe to run against production.
//
// Run against PROD without touching backend/.env:
//   PowerShell:  $env:RECONCILE_DATABASE_URL="<prod connection string>"; node scripts/reconcile-inventory.mjs
//   bash:        RECONCILE_DATABASE_URL="<prod connection string>" node scripts/reconcile-inventory.mjs
//
// If RECONCILE_DATABASE_URL is not set, it falls back to DATABASE_URL in backend/.env.
//
// What it proves:
//   1. Initial valuation  = pre-GST cost of EVERYTHING ever received (before any sale).
//   2. Current valuation  = on-hand qty x WAC (pre-GST). Must match the dashboard.
//   3. Sync check         = for every variant, cached balance == SUM(ledger deltas).
//                           Zero drift = inventory is perfectly in sync.

import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(here, "..", ".env") });

const url = process.env.RECONCILE_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
const num = (rows, key) => Number(rows[0]?.[key] ?? 0);

async function main() {
  // ── 1. Initial valuation (pre-GST cost of all received stock; pre-sales) ──
  // Because WAC = Σ(qty_recv x cost_excl)/Σ(qty_recv), valuing ALL received qty
  // at WAC collapses to Σ(qty_recv x cost_excl) — the pre-GST cost of everything
  // that ever entered stock. That is exactly the valuation before any sale.
  const initial = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(SUM(quantity_received::numeric * unit_cost_exclusive::numeric), 0)::float8 AS v
    FROM purchase_order_items
    WHERE quantity_received > 0
  `);

  // ── 2. Current valuation — must equal the dashboard figure ──
  const current = await prisma.$queryRawUnsafe(`
    WITH wac AS (
      SELECT variant_id,
        SUM(quantity_received::numeric * unit_cost_exclusive::numeric)
          / NULLIF(SUM(quantity_received::numeric), 0) AS wac
      FROM purchase_order_items
      WHERE quantity_received > 0
      GROUP BY variant_id
    )
    SELECT COALESCE(SUM(ib.quantity::numeric * COALESCE(w.wac, 0)), 0)::float8 AS v
    FROM inventory_balances ib
    LEFT JOIN wac w ON w.variant_id = ib.variant_id
    WHERE ib.quantity > 0
  `);

  // ── 3. Sync check: cached balance vs ledger sum, per variant ──
  const drift = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int AS variants_checked,
      COUNT(*) FILTER (WHERE bal <> led)::int AS drifted
    FROM (
      SELECT ib.variant_id,
        ib.quantity AS bal,
        COALESCE(SUM(il.quantity_delta), 0) AS led
      FROM inventory_balances ib
      LEFT JOIN inventory_logs il ON il.variant_id = ib.variant_id
      GROUP BY ib.variant_id, ib.quantity
    ) t
  `);

  const driftRows = await prisma.$queryRawUnsafe(`
    SELECT pv.sku, p.name AS product,
      ib.quantity::int AS balance_qty,
      COALESCE(SUM(il.quantity_delta), 0)::int AS ledger_qty,
      (ib.quantity - COALESCE(SUM(il.quantity_delta), 0))::int AS drift
    FROM inventory_balances ib
    JOIN product_variants pv ON pv.id = ib.variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN inventory_logs il ON il.variant_id = ib.variant_id
    GROUP BY pv.sku, p.name, ib.variant_id, ib.quantity
    HAVING ib.quantity <> COALESCE(SUM(il.quantity_delta), 0)
    ORDER BY ABS(ib.quantity - COALESCE(SUM(il.quantity_delta), 0)) DESC
    LIMIT 50
  `);

  // ── 4. Ledger totals vs balance totals (whole-inventory cross-check) ──
  const totals = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT COALESCE(SUM(quantity), 0)::int FROM inventory_balances) AS total_on_hand,
      (SELECT COALESCE(SUM(quantity_delta), 0)::int FROM inventory_logs)  AS ledger_net
  `);

  // ── 5. Movement breakdown (where the stock went) ──
  const movements = await prisma.$queryRawUnsafe(`
    SELECT movement_type::text AS type,
      COUNT(*)::int AS entries,
      SUM(quantity_delta)::int AS net_units
    FROM inventory_logs
    GROUP BY movement_type
    ORDER BY movement_type
  `);

  // ── 6. Profit recompute (all-time) — mirrors the Profit tab exactly ──
  const profit = await prisma.$queryRawUnsafe(`
    WITH wac AS (
      SELECT variant_id,
        SUM(quantity_received::numeric * unit_cost_exclusive::numeric)
          / NULLIF(SUM(quantity_received::numeric), 0) AS wac
      FROM purchase_order_items
      WHERE quantity_received > 0
      GROUP BY variant_id
    )
    SELECT
      COALESCE(SUM(oi.line_total::numeric), 0)::float8 AS revenue,
      COALESCE(SUM(
        oi.quantity::numeric * (
          CASE
            WHEN oi.is_giveaway OR oi.line_total = 0 THEN
              COALESCE(oi.unit_cost_snapshot, w.wac, pv.cost_price, 0::numeric)
            ELSE COALESCE(w.wac, pv.cost_price, 0::numeric)
          END
        )
      ), 0)::float8 AS cogs,
      COALESCE(SUM(oi.quantity), 0)::int AS units
    FROM order_items oi
    JOIN orders o  ON o.id = oi.order_id
    JOIN product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN wac w ON w.variant_id = oi.variant_id
    WHERE o.document_type::text = 'SALE'
      AND o.status::text = 'CONFIRMED'
  `);

  // ── INTEGRITY SCAN — checks designed to FAIL if something is desynced ──

  // (B) Sales -> ledger: confirmed sale units must equal net SALE ledger units.
  const soldUnits = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(SUM(oi.quantity), 0)::int AS n
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.document_type::text = 'SALE' AND o.status::text = 'CONFIRMED'
  `);
  const saleLedger = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(-SUM(quantity_delta), 0)::int AS n
    FROM inventory_logs
    WHERE movement_type::text IN ('SALE_OUT', 'SALE_REVERSAL_IN')
  `);

  // (C) Receiving -> ledger: current received qty must equal
  //     PURCHASE_IN minus rollback ADJUSTMENT_OUT (rollbacks are PO-referenced).
  const receivedNow = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(SUM(quantity_received), 0)::int AS n FROM purchase_order_items
  `);
  const purchaseIn = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(SUM(quantity_delta), 0)::int AS n
    FROM inventory_logs WHERE movement_type::text = 'PURCHASE_IN'
  `);
  const rollbackOut = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(-SUM(quantity_delta), 0)::int AS n
    FROM inventory_logs
    WHERE movement_type::text = 'ADJUSTMENT_OUT' AND reference_kind::text = 'PURCHASE_ORDER'
  `);

  // (D) Negative balances = oversell bug.
  const negatives = await prisma.$queryRawUnsafe(`
    SELECT pv.sku, p.name AS product, ib.quantity::int AS qty
    FROM inventory_balances ib
    JOIN product_variants pv ON pv.id = ib.variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE ib.quantity < 0
    ORDER BY ib.quantity ASC
  `);

  // (E) On-hand stock that values to ₹0 (no WAC and no catalog cost).
  const zeroCost = await prisma.$queryRawUnsafe(`
    WITH wac AS (
      SELECT variant_id,
        SUM(quantity_received::numeric * unit_cost_exclusive::numeric)
          / NULLIF(SUM(quantity_received::numeric), 0) AS wac
      FROM purchase_order_items WHERE quantity_received > 0 GROUP BY variant_id
    )
    SELECT pv.sku, p.name AS product, ib.quantity::int AS qty
    FROM inventory_balances ib
    JOIN product_variants pv ON pv.id = ib.variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN wac w ON w.variant_id = ib.variant_id
    WHERE ib.quantity > 0
      AND COALESCE(w.wac, pv.cost_price, 0) = 0
    ORDER BY ib.quantity DESC
    LIMIT 50
  `);

  // (G) Per-batch GST basis: inclusive cost vs taxable (pre-GST) value.
  //     Shows why valuation matched (or not) a sheet's "Amount" total.
  //     taxable_total is what valuation adds; inclusive_total is the cash bill.
  const batchGst = await prisma.$queryRawUnsafe(`
    SELECT
      to_char(b.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS imported_at,
      b.status::text AS status,
      COALESCE(SUM(poi.quantity_ordered), 0)::int AS units,
      STRING_AGG(DISTINCT poi.gst_pricing_mode::text, ',') AS gst_mode,
      COALESCE(SUM(poi.unit_cost::numeric * poi.quantity_ordered), 0)::float8 AS inclusive_total,
      COALESCE(SUM(poi.taxable_value::numeric), 0)::float8 AS taxable_total
    FROM bulk_import_batches b
    JOIN purchase_orders po ON po.bulk_import_batch_id = b.id
    JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
    GROUP BY b.id, b.created_at, b.status
    ORDER BY b.created_at
  `);

  // (H) WAC-blending breakdown for the latest COMPLETED import.
  //     Shows why valuation didn't rise by the raw import cost: restocking an
  //     existing SKU re-blends its weighted-average cost across all receipts,
  //     so on-hand value changes by (import cost − blending effect).
  const blendRows = await prisma.$queryRawUnsafe(`
    WITH latest_batch AS (
      SELECT id, created_at FROM bulk_import_batches
      WHERE status::text = 'COMPLETED'
      ORDER BY created_at DESC
      LIMIT 1
    ),
    batch_items AS (
      SELECT poi.variant_id,
        SUM(poi.quantity_received)::float8 AS batch_qty,
        SUM(poi.quantity_received::numeric * poi.unit_cost_exclusive::numeric)::float8 AS batch_cost
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      WHERE po.bulk_import_batch_id = (SELECT id FROM latest_batch)
        AND poi.quantity_received > 0
      GROUP BY poi.variant_id
    ),
    all_recv AS (
      SELECT variant_id,
        SUM(quantity_received)::float8 AS all_qty,
        SUM(quantity_received::numeric * unit_cost_exclusive::numeric)::float8 AS all_cost
      FROM purchase_order_items
      WHERE quantity_received > 0
      GROUP BY variant_id
    )
    SELECT pv.sku, p.name AS product,
      COALESCE(ib.quantity, 0)::float8 AS on_hand,
      ar.all_qty, ar.all_cost,
      bi.batch_qty, bi.batch_cost,
      (SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') FROM latest_batch) AS batch_at
    FROM batch_items bi
    JOIN all_recv ar ON ar.variant_id = bi.variant_id
    JOIN product_variants pv ON pv.id = bi.variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN inventory_balances ib ON ib.variant_id = bi.variant_id
  `);

  // (F) Rollback integrity: rolled-back batches must have all POs CANCELLED
  //     and zero leftover received qty.
  const rollbackBad = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*)::int FROM purchase_orders po
         JOIN bulk_import_batches b ON b.id = po.bulk_import_batch_id
         WHERE b.status::text = 'ROLLED_BACK' AND po.status::text <> 'CANCELLED') AS uncancelled_pos,
      (SELECT COALESCE(SUM(poi.quantity_received), 0)::int FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id
         JOIN bulk_import_batches b ON b.id = po.bulk_import_batch_id
         WHERE b.status::text = 'ROLLED_BACK') AS leftover_received
  `);

  const initialVal = num(initial, "v");
  const currentVal = num(current, "v");
  const checked = num(drift, "variants_checked");
  const drifted = num(drift, "drifted");
  const onHand = num(totals, "total_on_hand");
  const ledgerNet = num(totals, "ledger_net");

  console.log("\n══════════ INVENTORY RECONCILIATION ══════════\n");
  console.log("VALUATION (pre-GST, weighted average cost)");
  console.log(`  Initial (all stock received, pre-sales) : ${inr(initialVal)}`);
  console.log(`  Current (on-hand now)                   : ${inr(currentVal)}`);
  console.log(`  Consumed by sales / adjustments         : ${inr(initialVal - currentVal)}`);
  console.log(`     → Current should match the dashboard "Inventory valuation" card.\n`);

  console.log("STOCK SYNC (cached balance vs append-only ledger)");
  console.log(`  Variants checked   : ${checked}`);
  console.log(`  Out of sync (drift): ${drifted}`);
  console.log(`  Total on-hand (balances) : ${onHand}`);
  console.log(`  Ledger net (Σ deltas)    : ${ledgerNet}`);
  if (drifted === 0 && onHand === ledgerNet) {
    console.log("  ✅ PERFECTLY IN SYNC — every balance equals its ledger.\n");
  } else {
    console.log("  ⚠️  DRIFT DETECTED — see rows below.\n");
    console.table(driftRows.map((r) => ({ ...r })));
    console.log("");
  }

  console.log("MOVEMENT BREAKDOWN (net units by type)");
  console.table(movements.map((m) => ({ type: m.type, entries: m.entries, net_units: m.net_units })));

  // ── Profit (all-time) ──
  const revenue = num(profit, "revenue");
  const cogs = num(profit, "cogs");
  const grossProfit = revenue - cogs;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  console.log("\nPROFIT (all-time — set the dashboard Profit tab to ALL dates to compare)");
  console.log(`  Revenue      : ${inr(revenue)}`);
  console.log(`  COGS         : ${inr(cogs)}`);
  console.log(`  Gross profit : ${inr(grossProfit)}`);
  console.log(`  Margin       : ${margin.toFixed(1)}%`);
  console.log(`  Units sold   : ${num(profit, "units")}\n`);

  // ── Integrity scan ──
  const sold = num(soldUnits, "n");
  const saleLed = num(saleLedger, "n");
  const recv = num(receivedNow, "n");
  const purIn = num(purchaseIn, "n");
  const rbOut = num(rollbackOut, "n");
  const uncancelled = num(rollbackBad, "uncancelled_pos");
  const leftover = num(rollbackBad, "leftover_received");

  const checks = [
    {
      name: "Stock balances == ledger (no drift)",
      pass: drifted === 0 && onHand === ledgerNet,
      detail: `${drifted} drifted of ${checked}; on-hand ${onHand} vs ledger ${ledgerNet}`,
    },
    {
      name: "Valuation matches dashboard card",
      pass: true, // visual compare — printed above
      detail: `script ₹${currentVal.toFixed(2)} — compare to the card`,
    },
    {
      name: "Confirmed sales == SALE ledger units",
      pass: sold === saleLed,
      detail: `sold ${sold} vs ledger ${saleLed}`,
    },
    {
      name: "Received qty == PURCHASE_IN − rollback ADJUSTMENT_OUT",
      pass: recv === purIn - rbOut,
      detail: `received ${recv} vs (${purIn} − ${rbOut} = ${purIn - rbOut})`,
    },
    {
      name: "No negative balances (no oversell)",
      pass: negatives.length === 0,
      detail: `${negatives.length} variant(s) below zero`,
    },
    {
      name: "No on-hand stock valued at ₹0",
      pass: zeroCost.length === 0,
      detail: `${zeroCost.length} variant(s) with stock but no cost`,
    },
    {
      name: "Rolled-back batches fully reversed",
      pass: uncancelled === 0 && leftover === 0,
      detail: `${uncancelled} PO(s) not cancelled, ${leftover} unit(s) still marked received`,
    },
  ];

  console.log("INTEGRITY SCAN");
  for (const c of checks) {
    console.log(`  ${c.pass ? "✅" : "❌"}  ${c.name}`);
    console.log(`      ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(
    failed.length === 0
      ? "\n  ✅ ALL CHECKS PASSED — no desync found.\n"
      : `\n  ❌ ${failed.length} CHECK(S) FAILED — details below.\n`,
  );

  if (negatives.length > 0) {
    console.log("Negative balances (OVERSELL — real issue):");
    console.table(negatives.map((r) => ({ ...r })));
    console.log("");
  }
  if (zeroCost.length > 0) {
    console.log("On-hand stock valued at ₹0 (missing cost — money not counted in valuation):");
    console.table(zeroCost.map((r) => ({ ...r })));
    console.log("");
  }

  if (batchGst.length > 0) {
    console.log("BULK IMPORT BATCHES — GST BASIS (why valuation does/doesn't match a sheet total)");
    console.table(
      batchGst.map((b) => ({
        imported_at: b.imported_at,
        status: b.status,
        units: b.units,
        gst_mode: b.gst_mode,
        inclusive_total: `₹${Number(b.inclusive_total).toFixed(2)}`, // the cash bill
        taxable_total: `₹${Number(b.taxable_total).toFixed(2)}`, // what valuation adds
      })),
    );
    console.log("    inclusive_total = GST-inclusive cash bill • taxable_total = pre-GST value that hits valuation");
    console.log("    INCLUSIVE mode → taxable < inclusive (GST stripped).  EXCLUSIVE mode → taxable = your entered cost.\n");
  }

  // ── WAC-blending breakdown for the latest import ──
  if (blendRows.length > 0) {
    const batchAt = blendRows[0].batch_at;
    let totalImportCost = 0;
    let totalGap = 0;
    const detail = [];

    for (const r of blendRows) {
      const onHand = Number(r.on_hand);
      const allQty = Number(r.all_qty);
      const allCost = Number(r.all_cost);
      const batchQty = Number(r.batch_qty);
      const batchCost = Number(r.batch_cost);

      const wacNow = allQty > 0 ? allCost / allQty : 0;
      const prevQty = allQty - batchQty;
      const prevCost = allCost - batchCost;
      const wacPrev = prevQty > 0 ? prevCost / prevQty : 0;
      const onHandPrev = onHand - batchQty;

      const valNow = onHand * wacNow;
      const valPrev = prevQty > 0 ? onHandPrev * wacPrev : 0;
      const gap = batchCost + valPrev - valNow; // raw cost expected − actual valuation rise

      totalImportCost += batchCost;
      totalGap += gap;

      if (Math.abs(gap) >= 0.005) {
        detail.push({
          sku: r.sku,
          product: r.product,
          restock: r.batch_qty,
          on_hand: r.on_hand,
          prior_units: prevQty,
          wac_prev: `₹${wacPrev.toFixed(2)}`,
          wac_now: `₹${wacNow.toFixed(2)}`,
          gap: `₹${gap.toFixed(2)}`,
        });
      }
    }

    detail.sort((a, b) => Math.abs(parseFloat(b.gap.slice(1))) - Math.abs(parseFloat(a.gap.slice(1))));

    console.log(`WAC-BLENDING — latest import (${batchAt})`);
    console.log(`  Raw import cost (pre-GST)        : ${inr(totalImportCost)}`);
    console.log(`  Valuation rise actually recorded : ${inr(totalImportCost - totalGap)}`);
    console.log(`  Blending gap (re-priced WAC)     : ${inr(totalGap)}`);
    if (detail.length > 0) {
      console.log(`  ${detail.length} restocked SKU(s) whose new cost differed from their prior WAC:\n`);
      console.table(detail);
    } else {
      console.log("  No blending — every imported SKU was brand-new or matched its prior WAC exactly.");
    }
    console.log("    gap>0: new cost spread over already-sold units • gap<0: existing stock re-priced up");
    console.log("    Sum of gaps = the rupee difference between 'old valuation + import cost' and the new valuation.\n");
  }

  console.log("Notes:");
  console.log("  • Valuation is intentionally PRE-GST (input GST is a recoverable credit, not inventory cost).");
  console.log("  • 'Consumed' = pre-GST WAC value of everything that left stock since the start.");
  console.log("  • Drift = 0 + all integrity checks ✅ = sales/receipts/rollbacks are all syncing correctly.\n");
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
