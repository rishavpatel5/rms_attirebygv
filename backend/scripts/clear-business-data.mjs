/**
 * Wipes operational/business data only. Schema, migrations, and staff logins are preserved.
 *
 * Usage: node scripts/clear-business-data.mjs
 */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(here, "..", ".env") });

const prisma = new PrismaClient();

const TABLES = [
  "whatsapp_logs",
  "notifications",
  "sales_return_lines",
  "sales_returns",
  "exchanges",
  "payments",
  "order_items",
  "orders",
  "offer_products",
  "offers",
  "purchase_order_items",
  "purchase_orders",
  "stock_adjustment_lines",
  "stock_adjustments",
  "inventory_logs",
  "inventory_balances",
  "product_variants",
  "products",
  "categories",
  "colors",
  "sizes",
  "customers",
  "suppliers",
];

async function countTable(table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${table}"`);
  return rows[0]?.c ?? 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in backend/.env");
  }

  console.log("Counts before clear:");
  for (const table of TABLES) {
    const c = await countTable(table);
    if (c > 0) console.log(`  ${table}: ${c}`);
  }
  const users = await prisma.user.count();
  console.log(`  users (kept): ${users}`);

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );

  await prisma.$executeRawUnsafe(
    `UPDATE "invoice_sequence" SET "next_seq" = 0, "updated_at" = NOW() WHERE "id" = 'singleton'`,
  );

  console.log("\nCounts after clear:");
  let remaining = 0;
  for (const table of TABLES) {
    const c = await countTable(table);
    if (c > 0) {
      console.log(`  ${table}: ${c}`);
      remaining += c;
    }
  }

  if (remaining > 0) {
    throw new Error("Some tables still contain rows after truncate.");
  }

  console.log("OK — business data cleared. Users and schema unchanged.");
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
