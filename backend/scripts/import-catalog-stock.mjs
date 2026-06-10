import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(here, "..", ".env") });

const prisma = new PrismaClient();

const [, , fileArg, modeArg] = process.argv;
const APPLY = modeArg === "--apply";

if (!fileArg) {
  console.error("Usage: node scripts/import-catalog-stock.mjs <file.xlsx> [--apply]");
  process.exit(1);
}

const DEFAULT_SUPPLIER = "Opening Stock";

function normHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function slugify(value) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || "item";
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function clean(value) {
  return isBlank(value) ? "" : String(value).trim();
}

function numberValue(value, fallback = 0) {
  if (isBlank(value)) return fallback;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function intValue(value, fallback = 0) {
  return Math.max(0, Math.floor(numberValue(value, fallback)));
}

function boolValue(value, fallback = false) {
  if (isBlank(value)) return fallback;
  const v = String(value).trim().toLowerCase();
  return ["true", "yes", "y", "1", "inclusive", "inc"].includes(v);
}

function kindValue(value) {
  const v = clean(value).toUpperCase();
  if (["ACCESSORY", "ACCESSORIES", "ACC"].includes(v)) return "ACCESSORY";
  return "APPAREL";
}

function genderValue(value, kind) {
  const v = clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (["MENS", "MEN", "MALE"].includes(v)) return "MENS";
  if (["WOMENS", "WOMEN", "FEMALE", "LADIES"].includes(v)) return "WOMENS";
  if (["KIDS", "KID", "CHILDREN"].includes(v)) return "KIDS";
  if (["NOT_APPLICABLE", "NA", "N_A", "NONE"].includes(v)) return "NOT_APPLICABLE";
  if (v === "UNISEX") return "UNISEX";
  return kind === "ACCESSORY" ? "NOT_APPLICABLE" : "UNISEX";
}

const FIELD_ALIASES = {
  productName: ["productname", "product", "itemname", "item", "stylename", "style", "name"],
  category: ["category", "cat", "shelfcategory"],
  kind: ["kind", "productkind", "type", "producttype"],
  gender: ["gender"],
  brand: ["brand"],
  color: ["color", "colour"],
  size: ["size"],
  sku: ["sku", "skucode", "itemcode", "code"],
  listPrice: ["listprice", "mrp", "sellingprice", "saleprice", "retailprice", "price"],
  costPrice: ["costprice", "defaultcost", "mastercost"],
  catalogGstInclusive: ["gstinclusive", "listgstinclusive", "cataloggstinclusive"],
  cgstPct: ["cgstpct", "cgst", "cgstrate"],
  sgstPct: ["sgstpct", "sgst", "sgstrate"],
  igstPct: ["igstpct", "igst", "igstrate"],
  lowStockThreshold: ["lowstockthreshold", "lowstock", "threshold"],
  supplierName: ["suppliername", "supplier", "vendor", "vendorname"],
  quantity: ["quantity", "qty", "stock", "openingstock", "receivedqty", "receiveqty"],
  unitCost: ["unitcost", "purchasecost", "purchaseprice", "rate", "buyingprice"],
  purchaseGstInclusive: ["purchasegstinclusive", "unitcostgstinclusive", "receivegstinclusive"],
};

function get(row, field) {
  for (const alias of FIELD_ALIASES[field] ?? []) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return undefined;
}

function normalizeRow(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    out[normHeader(key)] = value;
  }
  return out;
}

function readWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "" }).map(normalizeRow);
    for (const row of sheetRows) rows.push({ sheetName, row });
  }
  return rows;
}

function parseRows(filePath) {
  const rawRows = readWorkbook(filePath);
  const rows = [];
  const errors = [];

  rawRows.forEach(({ sheetName, row }, index) => {
    const rowNo = index + 2;
    const productName = clean(get(row, "productName"));
    const sku = clean(get(row, "sku")).replace(/^[`'"]+/, "").toUpperCase();
    const quantity = intValue(get(row, "quantity"), 0);

    if (!productName && !sku && quantity === 0) return;

    const category = clean(get(row, "category")) || "Uncategorized";
    const kind = kindValue(get(row, "kind"));
    const gender = genderValue(get(row, "gender"), kind);
    const color = clean(get(row, "color"));
    const size = clean(get(row, "size"));

    if (!productName) errors.push(`${sheetName} row ${rowNo}: product_name is required`);
    if (!sku) errors.push(`${sheetName} row ${rowNo}: sku is required`);
    if (kind === "APPAREL" && !color) errors.push(`${sheetName} row ${rowNo}: color is required for APPAREL`);
    if (kind === "APPAREL" && !size) errors.push(`${sheetName} row ${rowNo}: size is required for APPAREL`);
    if (quantity > 0 && numberValue(get(row, "unitCost"), NaN) < 0) {
      errors.push(`${sheetName} row ${rowNo}: unit_cost is invalid`);
    }

    const defaultRates = kind === "APPAREL" ? { cgst: 2.5, sgst: 2.5, igst: 0 } : { cgst: 9, sgst: 9, igst: 0 };

    rows.push({
      sheetName,
      rowNo,
      productName,
      category,
      kind,
      gender,
      brand: clean(get(row, "brand")) || null,
      color: color || null,
      size: size || null,
      sku,
      listPrice: numberValue(get(row, "listPrice"), 0),
      costPrice: isBlank(get(row, "costPrice")) ? null : numberValue(get(row, "costPrice"), 0),
      catalogGstInclusive: boolValue(get(row, "catalogGstInclusive"), true),
      cgstPct: numberValue(get(row, "cgstPct"), defaultRates.cgst),
      sgstPct: numberValue(get(row, "sgstPct"), defaultRates.sgst),
      igstPct: numberValue(get(row, "igstPct"), defaultRates.igst),
      lowStockThreshold: isBlank(get(row, "lowStockThreshold")) ? 5 : intValue(get(row, "lowStockThreshold"), 5),
      supplierName: clean(get(row, "supplierName")) || DEFAULT_SUPPLIER,
      quantity,
      unitCost: isBlank(get(row, "unitCost"))
        ? numberValue(get(row, "costPrice"), 0)
        : numberValue(get(row, "unitCost"), 0),
      purchaseGstInclusive: boolValue(get(row, "purchaseGstInclusive"), false),
    });
  });

  const seenSkus = new Map();
  for (const row of rows) {
    const prev = seenSkus.get(row.sku);
    if (prev) errors.push(`Duplicate sku ${row.sku}: rows ${prev} and ${row.rowNo}`);
    seenSkus.set(row.sku, row.rowNo);
    if (row.quantity > 0 && row.unitCost <= 0) errors.push(`row ${row.rowNo}: unit_cost is required when quantity > 0`);
  }

  return { rows, errors };
}

async function uniqueSlug(tx, model, base) {
  let slug = slugify(base);
  for (let i = 1; ; i++) {
    const existing = await tx[model].findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
    slug = `${slugify(base)}-${i}`.slice(0, 120);
  }
}

function sizeCode(label) {
  return clean(label)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "OS";
}

function computePurchase(row) {
  const qty = row.quantity;
  const gross = new Prisma.Decimal(row.unitCost).mul(qty);
  const rate = new Prisma.Decimal(row.cgstPct).plus(row.sgstPct).plus(row.igstPct).div(100);
  const taxable = row.purchaseGstInclusive && rate.gt(0)
    ? gross.div(new Prisma.Decimal(1).plus(rate))
    : gross;
  const cgstAmount = taxable.mul(row.cgstPct).div(100);
  const sgstAmount = taxable.mul(row.sgstPct).div(100);
  const igstAmount = taxable.mul(row.igstPct).div(100);
  const lineTotal = taxable.plus(cgstAmount).plus(sgstAmount).plus(igstAmount);
  const unitCostExclusive = qty > 0 ? taxable.div(qty) : new Prisma.Decimal(0);
  return { taxable, cgstAmount, sgstAmount, igstAmount, lineTotal, unitCostExclusive };
}

async function applyImport(rows) {
  const summary = {
    categories: 0,
    colors: 0,
    sizes: 0,
    products: 0,
    variants: 0,
    suppliers: 0,
    purchaseOrders: 0,
    purchaseLines: 0,
    stockUnits: 0,
  };

  const categories = [...new Map(rows.map((row) => [row.category.toLowerCase(), row.category])).values()];
  const categoryData = categories.map((name) => ({ name, slug: slugify(name) }));
  summary.categories = (await prisma.category.createMany({ data: categoryData, skipDuplicates: true })).count;
  const categoryRows = await prisma.category.findMany({ where: { slug: { in: categoryData.map((row) => row.slug) } } });
  const categoryByName = new Map(categoryRows.map((row) => [row.name.toLowerCase(), row]));

  const colors = [...new Map(rows.filter((row) => row.color).map((row) => [row.color.toLowerCase(), row.color])).values()];
  summary.colors = (await prisma.color.createMany({ data: colors.map((name) => ({ name })), skipDuplicates: true })).count;
  const colorRows = await prisma.color.findMany({ where: { name: { in: colors } } });
  const colorByName = new Map(colorRows.map((row) => [row.name.toLowerCase(), row]));

  const sizes = [...new Map(rows.filter((row) => row.size).map((row) => [row.size.toLowerCase(), row.size])).values()];
  const usedSizeCodes = new Set();
  const sizeData = sizes.map((label) => {
    const base = sizeCode(label);
    let code = base;
    for (let i = 2; usedSizeCodes.has(code); i++) {
      code = `${base}-${i}`.slice(0, 32);
    }
    usedSizeCodes.add(code);
    return { label, code };
  });
  summary.sizes = (await prisma.size.createMany({ data: sizeData, skipDuplicates: true })).count;
  const sizeRows = await prisma.size.findMany({ where: { code: { in: sizeData.map((row) => row.code) } } });
  const sizeByLabel = new Map(sizeRows.map((row) => [row.label.toLowerCase(), row]));

  const productGroups = new Map();
  for (const row of rows) {
    const category = categoryByName.get(row.category.toLowerCase());
    const key = [
      row.productName.toLowerCase(),
      category.id,
      row.kind,
      row.gender,
      row.brand?.toLowerCase() ?? "",
    ].join("|");
    if (!productGroups.has(key)) {
      productGroups.set(key, { row, category, slug: slugify(`${row.productName}-${row.category}`) });
    }
  }
  const usedProductSlugs = new Set();
  const productData = [...productGroups.values()].map(({ row, category, slug }) => {
    let uniqueSlugValue = slug;
    for (let i = 2; usedProductSlugs.has(uniqueSlugValue); i++) {
      uniqueSlugValue = `${slug}-${i}`.slice(0, 120);
    }
    usedProductSlugs.add(uniqueSlugValue);
    return {
      name: row.productName,
      slug: uniqueSlugValue,
      brand: row.brand,
      kind: row.kind,
      gender: row.gender,
      categoryId: category.id,
    };
  });
  summary.products = (await prisma.product.createMany({ data: productData, skipDuplicates: true })).count;
  const productRows = await prisma.product.findMany({ where: { slug: { in: productData.map((row) => row.slug) } } });
  const productBySlug = new Map(productRows.map((row) => [row.slug, row]));
  const productByGroupKey = new Map();
  [...productGroups.entries()].forEach(([key], index) => {
    productByGroupKey.set(key, productBySlug.get(productData[index].slug));
  });

  const variantData = rows.map((row) => {
    const category = categoryByName.get(row.category.toLowerCase());
    const productKey = [
      row.productName.toLowerCase(),
      category.id,
      row.kind,
      row.gender,
      row.brand?.toLowerCase() ?? "",
    ].join("|");
    const product = productByGroupKey.get(productKey);
    const color = row.color ? colorByName.get(row.color.toLowerCase()) : null;
    const size = row.size ? sizeByLabel.get(row.size.toLowerCase()) : null;
    return {
      productId: product.id,
      sku: row.sku,
      listPrice: new Prisma.Decimal(row.listPrice),
      costPrice: row.costPrice === null ? null : new Prisma.Decimal(row.costPrice),
      gstEnabled: true,
      gstPricingMode: row.catalogGstInclusive ? "INCLUSIVE" : "EXCLUSIVE",
      cgstRate: new Prisma.Decimal(row.cgstPct),
      sgstRate: new Prisma.Decimal(row.sgstPct),
      igstRate: new Prisma.Decimal(row.igstPct),
      lowStockThreshold: row.lowStockThreshold,
      colorId: color?.id ?? null,
      sizeId: size?.id ?? null,
    };
  });
  summary.variants = (await prisma.productVariant.createMany({ data: variantData, skipDuplicates: true })).count;
  const variantRows = await prisma.productVariant.findMany({ where: { sku: { in: rows.map((row) => row.sku) } } });
  const variantBySku = new Map(variantRows.map((row) => [row.sku, row]));

  await prisma.inventoryBalance.createMany({
    data: variantRows.map((variant) => ({ variantId: variant.id, quantity: 0 })),
    skipDuplicates: true,
  });

  const stockRows = rows.filter((row) => row.quantity > 0);
  const bySupplier = new Map();
  for (const row of stockRows) {
    const key = row.supplierName.toLowerCase();
    if (!bySupplier.has(key)) bySupplier.set(key, []);
    bySupplier.get(key).push(row);
  }

  const supplierNames = [...bySupplier.values()].map((supplierRows) => supplierRows[0].supplierName || DEFAULT_SUPPLIER);
  summary.suppliers = (await prisma.supplier.createMany({ data: supplierNames.map((name) => ({ name })), skipDuplicates: true })).count;
  const supplierRows = await prisma.supplier.findMany({ where: { name: { in: supplierNames } } });
  const supplierByName = new Map(supplierRows.map((row) => [row.name.toLowerCase(), row]));

  for (const supplierStockRows of bySupplier.values()) {
    const supplierName = supplierStockRows[0].supplierName || DEFAULT_SUPPLIER;
    const supplier = supplierByName.get(supplierName.toLowerCase());
    const computed = supplierStockRows.map(computePurchase);
    const subtotal = supplierStockRows.reduce((sum, row) => sum.plus(new Prisma.Decimal(row.unitCost).mul(row.quantity)), new Prisma.Decimal(0));
    const taxableValueTotal = computed.reduce((sum, line) => sum.plus(line.taxable), new Prisma.Decimal(0));
    const cgstTotal = computed.reduce((sum, line) => sum.plus(line.cgstAmount), new Prisma.Decimal(0));
    const sgstTotal = computed.reduce((sum, line) => sum.plus(line.sgstAmount), new Prisma.Decimal(0));
    const igstTotal = computed.reduce((sum, line) => sum.plus(line.igstAmount), new Prisma.Decimal(0));
    const grandTotal = computed.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));

    const po = await prisma.purchaseOrder.create({
      data: {
        supplierId: supplier.id,
        status: "RECEIVED",
        orderedAt: new Date(),
        receivedAt: new Date(),
        subtotal,
        discountTotal: new Prisma.Decimal(0),
        taxableValueTotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        grandTotal,
      },
    });
    summary.purchaseOrders++;

    const itemData = supplierStockRows.map((row, index) => {
      const calc = computed[index];
      return {
        purchaseOrderId: po.id,
        variantId: variantBySku.get(row.sku).id,
        quantityOrdered: row.quantity,
        quantityReceived: row.quantity,
        unitCost: new Prisma.Decimal(row.unitCost),
        gstEnabled: true,
        gstPricingMode: row.purchaseGstInclusive ? "INCLUSIVE" : "EXCLUSIVE",
        cgstRate: new Prisma.Decimal(row.cgstPct),
        sgstRate: new Prisma.Decimal(row.sgstPct),
        igstRate: new Prisma.Decimal(row.igstPct),
        taxableValue: calc.taxable,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        lineTotal: calc.lineTotal,
        unitCostExclusive: calc.unitCostExclusive,
      };
    });
    summary.purchaseLines += (await prisma.purchaseOrderItem.createMany({ data: itemData })).count;

    await prisma.inventoryLog.createMany({
      data: supplierStockRows.map((row) => ({
        variantId: variantBySku.get(row.sku).id,
        quantityDelta: row.quantity,
        movementType: "PURCHASE_IN",
        referenceKind: "PURCHASE_ORDER",
        referenceId: po.id,
        metadata: { importRow: row.rowNo, sku: row.sku },
      })),
    });

    const values = supplierStockRows
      .map((row) => `('${variantBySku.get(row.sku).id.replace(/'/g, "''")}', ${row.quantity})`)
      .join(", ");
    await prisma.$executeRawUnsafe(
      `UPDATE "inventory_balances" AS ib
       SET "quantity" = ib."quantity" + v.qty
       FROM (VALUES ${values}) AS v(variant_id, qty)
       WHERE ib."variant_id" = v.variant_id`,
    );

    summary.stockUnits += supplierStockRows.reduce((sum, row) => sum + row.quantity, 0);
  }

  return summary;
}

async function main() {
  const { rows, errors } = parseRows(fileArg);
  console.log(`File: ${fileArg}`);
  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW"}`);
  console.log(`Parsed rows: ${rows.length}`);

  const products = new Set(rows.map((r) => `${r.productName}|${r.category}`));
  const suppliers = new Set(rows.filter((r) => r.quantity > 0).map((r) => r.supplierName));
  const units = rows.reduce((sum, row) => sum + row.quantity, 0);
  console.log(`Products: ${products.size}`);
  console.log(`SKUs: ${rows.length}`);
  console.log(`Stock units: ${units}`);
  console.log(`Suppliers: ${suppliers.size}`);
  console.log("Sample rows:");
  for (const row of rows.slice(0, 8)) {
    console.log(`  row ${row.rowNo}: ${row.productName} | ${row.sku} | qty=${row.quantity} | list=${row.listPrice} | unit=${row.unitCost}`);
  }

  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const err of errors.slice(0, 50)) console.log(`  - ${err}`);
    throw new Error(`${errors.length} validation error(s). Fix the sheet and retry.`);
  }

  if (!APPLY) {
    console.log("\nPreview only. Re-run with --apply to import.");
    return;
  }

  const summary = await applyImport(rows);
  console.log("\nImport complete:");
  for (const [key, value] of Object.entries(summary)) {
    console.log(`  ${key}: ${value}`);
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
