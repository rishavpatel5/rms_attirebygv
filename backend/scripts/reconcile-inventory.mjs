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

  console.log("\nNotes:");
  console.log("  • Valuation is intentionally PRE-GST (input GST is a recoverable credit, not inventory cost).");
  console.log("  • 'Consumed' = pre-GST WAC value of everything that left stock since the start.");
  console.log("  • Drift = 0 is the proof your sales/returns/exchanges are all syncing correctly.\n");
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
