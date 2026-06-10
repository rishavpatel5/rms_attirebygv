import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(here, "..", ".env") });

const prisma = new PrismaClient();

async function count(table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${table}"`);
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  const qty = await prisma.$queryRaw`SELECT COALESCE(SUM(quantity),0)::int AS qty FROM "inventory_balances"`;
  console.log(JSON.stringify({
    products: await count("products"),
    product_variants: await count("product_variants"),
    inventory_balances: await count("inventory_balances"),
    suppliers: await count("suppliers"),
    purchase_orders: await count("purchase_orders"),
    purchase_order_items: await count("purchase_order_items"),
    inventory_logs: await count("inventory_logs"),
    inventory_quantity_sum: Number(qty[0]?.qty ?? 0),
  }, null, 2));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
