import { GstPricingMode, Prisma, ProductGender, ProductKind } from "@prisma/client";
import { read as xlsxRead, utils as xlsxUtils } from "xlsx";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { computeLine, computeOrderTotals } from "../../lib/gst-calculator.js";
import { resolveVariantMasterUpdate } from "../../lib/bulk-import-variant-update.js";

const EXPECTED_HEADERS = [
  "sr_no", "product_name", "sku", "shelf_category", "kind", "gender",
  "brand", "color", "size", "quantity", "cost_price", "list_price",
  "cgst_pct", "sgst_pct", "igst_pct", "low_stock_threshold",
  "supplier_name", "gst_inclusive",
] as const;

// Map friendly spreadsheet values → the actual Prisma enum values, so a sheet
// that says MALE/FEMALE/CLOTHING still imports instead of crashing at commit
// with an invalid-enum error. Anything unmapped becomes a clean scan error.
const KIND_MAP: Record<string, ProductKind> = {
  APPAREL: ProductKind.APPAREL,
  APPARELS: ProductKind.APPAREL,
  CLOTHING: ProductKind.APPAREL,
  CLOTHES: ProductKind.APPAREL,
  ACCESSORY: ProductKind.ACCESSORY,
  ACCESSORIES: ProductKind.ACCESSORY,
  ACC: ProductKind.ACCESSORY,
};
const GENDER_MAP: Record<string, ProductGender> = {
  MENS: ProductGender.MENS,
  MEN: ProductGender.MENS,
  MALE: ProductGender.MENS,
  MAN: ProductGender.MENS,
  "MEN'S": ProductGender.MENS,
  WOMENS: ProductGender.WOMENS,
  WOMEN: ProductGender.WOMENS,
  FEMALE: ProductGender.WOMENS,
  WOMAN: ProductGender.WOMENS,
  LADIES: ProductGender.WOMENS,
  "WOMEN'S": ProductGender.WOMENS,
  UNISEX: ProductGender.UNISEX,
  UNI: ProductGender.UNISEX,
  KIDS: ProductGender.KIDS,
  KID: ProductGender.KIDS,
  CHILDREN: ProductGender.KIDS,
  BOYS: ProductGender.KIDS,
  GIRLS: ProductGender.KIDS,
  NOT_APPLICABLE: ProductGender.NOT_APPLICABLE,
  NA: ProductGender.NOT_APPLICABLE,
  "N/A": ProductGender.NOT_APPLICABLE,
  NONE: ProductGender.NOT_APPLICABLE,
};

// ── Jaro-Winkler fuzzy similarity ──────────────────────────────────────────

function jaroSim(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const md = Math.max(Math.floor(Math.max(la, lb) / 2) - 1, 0);
  const am = new Array<boolean>(la).fill(false);
  const bm = new Array<boolean>(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - md), hi = Math.min(i + md + 1, lb);
    for (let j = lo; j < hi; j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  return (matches / la + matches / lb + (matches - t / 2) / matches) / 3;
}

function strSim(a: string, b: string): number {
  const s1 = a.toLowerCase().trim(), s2 = b.toLowerCase().trim();
  const j = jaroSim(s1, s2);
  let pfx = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) pfx++; else break;
  }
  return j + pfx * 0.1 * (1 - j);
}

// ── Shared types ────────────────────────────────────────────────────────────

export type RawRow = {
  sr_no: number;
  product_name: string;
  sku: string;
  shelf_category: string;
  kind: string;
  gender: string;
  brand: string;
  color: string;
  size: string;
  quantity: number;
  cost_price: number;
  list_price: number;
  cgst_pct: number;
  sgst_pct: number;
  igst_pct: number;
  low_stock_threshold: number | null;
  supplier_name: string;
  gst_inclusive: boolean;
};

export type ScanRowResult = {
  rowNum: number;
  raw: RawRow;
  status: "green" | "amber" | "red";
  action: "receive_only" | "create_variant" | "create_product_and_variant";
  errors: string[];
  warnings: string[];
  variantId?: string;
  productId?: string;
  productMatch?: { id: string; name: string; similarity: number };
  supplierId?: string;
  categoryId?: string;
  categoryIsNew?: boolean;
  colorId?: string;
  colorIsNew?: boolean;
  sizeId?: string;
  sizeIsNew?: boolean;
};

export type ScanResult = {
  totalRows: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
  rows: ScanRowResult[];
};

export type CommitRow = {
  rowNum: number;
  action: "receive_only" | "create_variant" | "create_product_and_variant";
  variantId?: string;
  productId?: string;
  raw: RawRow;
  supplierId: string;
  categoryId?: string;
  categoryIsNew?: boolean;
  colorId?: string;
  colorIsNew?: boolean;
  sizeId?: string;
  sizeIsNew?: boolean;
};

export type CommitRequest = { rows: CommitRow[] };

export type CommitResult = {
  success: boolean;
  batchId: string;
  purchaseOrderIds: string[];
  rowsImported: number;
  newCategoriesCreated: number;
  newColorsCreated: number;
  newSizesCreated: number;
  newProductsCreated: number;
  newVariantsCreated: number;
};

// Step 1 result — catalog only, no stock received yet.
export type CatalogResult = {
  batchId: string;
  rowsImported: number;
  newCategoriesCreated: number;
  newColorsCreated: number;
  newSizesCreated: number;
  newProductsCreated: number;
  newVariantsCreated: number;
  variantsUpdated: number;
};

// Step 2 result — stock received against an already-created catalog batch.
export type StockResult = {
  batchId: string;
  purchaseOrderIds: string[];
  rowsImported: number;
  unitsReceived: number;
};

export type BatchListItem = {
  id: string;
  status: "AWAITING_STOCK" | "COMPLETED" | "ROLLED_BACK";
  rowsImported: number;
  poCount: number;
  createdAt: string;
  rolledBackAt: string | null;
};

export type RollbackResult = {
  success: true;
  batchId: string;
  posReverted: number;
  unitsReturned: number;
};

// ── Helper ──────────────────────────────────────────────────────────────────

async function uniqueSlug(base: string): Promise<string> {
  let slug = base, i = 1;
  while (await prisma.product.findUnique({ where: { slug } })) slug = `${base}-${i++}`;
  return slug;
}

async function uniqueCategorySlug(base: string): Promise<string> {
  let slug = base, i = 1;
  while (await prisma.category.findUnique({ where: { slug } })) slug = `${slug}-${i++}`;
  return slug;
}

// ── Scan ────────────────────────────────────────────────────────────────────

export async function scanImportFile(buffer: Buffer): Promise<ScanResult> {
  const wb = xlsxRead(buffer, { type: "buffer", cellDates: false });
  const wsName = wb.SheetNames[0];
  if (!wsName) throw new AppError(400, "EMPTY_WORKBOOK", "Workbook has no sheets");
  const ws = wb.Sheets[wsName]!;

  const raw = xlsxUtils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  if (raw.length < 2) throw new AppError(400, "EMPTY_SHEET", "No data rows found");

  const headerRow = (raw[0] as (unknown[])).map((h) => String(h ?? "").trim().toLowerCase());
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (headerRow[i] !== EXPECTED_HEADERS[i]) {
      throw new AppError(
        400,
        "INVALID_HEADERS",
        `Column ${String.fromCharCode(65 + i)}: expected "${EXPECTED_HEADERS[i]}", found "${headerRow[i] ?? "(empty)"}"`,
      );
    }
  }

  const dataRows = (raw.slice(1) as unknown[][]).filter((r) =>
    r.some((c) => c !== null && c !== undefined && c !== ""),
  );

  if (!dataRows.length) throw new AppError(400, "EMPTY_SHEET", "No data rows");
  if (dataRows.length > 500) throw new AppError(400, "TOO_MANY_ROWS", "Maximum 500 rows per import");

  // Pre-load all DB entities for matching
  const [allProducts, allSuppliers, allCategories, allColors, allSizes, allVariants] =
    await Promise.all([
      prisma.product.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.color.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.size.findMany({ where: { isActive: true }, select: { id: true, label: true, code: true } }),
      prisma.productVariant.findMany({ where: { isActive: true }, select: { id: true, sku: true } }),
    ]);

  const skuMap = new Map<string, string>(); // lowercase sku → variantId
  for (const v of allVariants) skuMap.set(v.sku.toLowerCase(), v.id);

  const results: ScanRowResult[] = [];
  const seenSkus = new Set<string>(); // catch duplicates within the file

  const numCell = (v: unknown, fallback = 0) =>
    v !== null && v !== undefined && v !== "" ? Number(v) : fallback;
  const strCell = (v: unknown) => String(v ?? "").trim();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowNum = i + 2;
    const errors: string[] = [];
    const warnings: string[] = [];

    const sr_no = numCell(row[0]) || i + 1;
    const product_name = strCell(row[1]);
    const sku = strCell(row[2]);
    const shelf_category = strCell(row[3]);
    const kindRaw = strCell(row[4]).toUpperCase();
    const genderRaw = strCell(row[5]).toUpperCase();
    const kind = KIND_MAP[kindRaw] ?? ""; // mapped enum value, or "" when invalid
    const gender = GENDER_MAP[genderRaw] ?? "";
    const brand = strCell(row[6]);
    const color = strCell(row[7]);
    const size = strCell(row[8]);
    const quantity = numCell(row[9]);
    const cost_price = numCell(row[10]);
    const list_price = numCell(row[11]);
    const cgst_pct = numCell(row[12]);
    const sgst_pct = numCell(row[13]);
    const igst_pct = numCell(row[14]);
    const low_stock_threshold =
      row[15] !== null && row[15] !== undefined && row[15] !== "" ? numCell(row[15]) : null;
    const supplier_name = strCell(row[16]);
    const gst_raw = strCell(row[17]).toUpperCase();
    const gst_inclusive = ["YES", "Y", "TRUE", "1"].includes(gst_raw);

    const rawRow: RawRow = {
      sr_no, product_name, sku, shelf_category, kind, gender, brand,
      color, size, quantity, cost_price, list_price, cgst_pct, sgst_pct, igst_pct,
      low_stock_threshold, supplier_name, gst_inclusive,
    };

    // Required field validation
    if (!sku) errors.push("SKU is required");
    if (!product_name) errors.push("Product name is required");
    if (!shelf_category) errors.push("Shelf category is required");
    if (!supplier_name) errors.push("Supplier name is required");
    if (!quantity || isNaN(quantity) || quantity <= 0) errors.push("Quantity must be > 0");
    else if (!Number.isInteger(quantity)) errors.push("Quantity must be a whole number");
    if (isNaN(cost_price) || cost_price < 0) errors.push("Cost price must be ≥ 0");
    if (isNaN(list_price) || list_price < 0) errors.push("List price must be ≥ 0");

    if (!kind) errors.push(`Kind must be APPAREL or ACCESSORY (got "${kindRaw || "empty"}")`);
    if (!gender)
      errors.push(`Gender must be MENS, WOMENS, UNISEX or KIDS (got "${genderRaw || "empty"}")`);

    if (sku) {
      if (seenSkus.has(sku.toLowerCase())) {
        errors.push(`Duplicate SKU in this file: "${sku}"`);
      } else {
        seenSkus.add(sku.toLowerCase());
      }
    }

    if (errors.length) {
      results.push({ rowNum, raw: rawRow, status: "red", action: "receive_only", errors, warnings });
      continue;
    }

    // Fuzzy match supplier (must find, else red)
    let supplierId: string | undefined;
    let bestSup = 0;
    for (const s of allSuppliers) {
      const sc = strSim(supplier_name, s.name);
      if (sc > bestSup) { bestSup = sc; supplierId = s.id; }
    }
    if (bestSup < 0.85) {
      errors.push(`Supplier "${supplier_name}" not found (best match ${Math.round(bestSup * 100)}%)`);
      results.push({ rowNum, raw: rawRow, status: "red", action: "receive_only", errors, warnings });
      continue;
    }

    // Fuzzy match category (auto-create if not found)
    let categoryId: string | undefined;
    let categoryIsNew = false;
    let bestCat = 0;
    for (const c of allCategories) {
      const sc = strSim(shelf_category, c.name);
      if (sc > bestCat) { bestCat = sc; categoryId = c.id; }
    }
    if (bestCat < 0.85) {
      categoryId = undefined;
      categoryIsNew = true;
      warnings.push(`Category "${shelf_category}" will be auto-created`);
    }

    // Color match (auto-create if missing)
    let colorId: string | undefined;
    let colorIsNew = false;
    if (color) {
      const cm = allColors.find((c) => c.name.toLowerCase() === color.toLowerCase());
      if (cm) { colorId = cm.id; }
      else { colorIsNew = true; warnings.push(`Color "${color}" will be auto-created`); }
    }

    // Size match (auto-create if missing)
    let sizeId: string | undefined;
    let sizeIsNew = false;
    if (size) {
      const sm = allSizes.find(
        (s) => s.label.toLowerCase() === size.toLowerCase() || s.code.toLowerCase() === size.toLowerCase(),
      );
      if (sm) { sizeId = sm.id; }
      else { sizeIsNew = true; warnings.push(`Size "${size}" will be auto-created`); }
    }

    // SKU lookup
    const existingVariantId = skuMap.get(sku.toLowerCase());
    if (existingVariantId) {
      results.push({
        rowNum, raw: rawRow, status: "green", action: "receive_only", errors, warnings,
        variantId: existingVariantId, supplierId, categoryId, categoryIsNew, colorId, sizeId,
      });
      continue;
    }

    // New SKU — fuzzy match product name (≥85% → add variant; else → new product)
    let productId: string | undefined;
    let productMatch: { id: string; name: string; similarity: number } | undefined;
    let bestProd = 0;
    for (const p of allProducts) {
      const sc = strSim(product_name, p.name);
      if (sc > bestProd) {
        bestProd = sc;
        if (sc >= 0.85) {
          productMatch = { id: p.id, name: p.name, similarity: sc };
          productId = p.id;
        }
      }
    }

    const action = productId ? "create_variant" : "create_product_and_variant";
    if (productId) {
      warnings.push(`New variant will be added to "${productMatch!.name}" (${Math.round(bestProd * 100)}% match)`);
    } else {
      warnings.push(`New product "${product_name}" will be created`);
    }

    results.push({
      rowNum, raw: rawRow, status: "amber", action, errors, warnings,
      productId, productMatch, supplierId, categoryId, categoryIsNew, colorId, colorIsNew, sizeId, sizeIsNew,
    });
  }

  return {
    totalRows: results.length,
    greenCount: results.filter((r) => r.status === "green").length,
    amberCount: results.filter((r) => r.status === "amber").length,
    redCount: results.filter((r) => r.status === "red").length,
    rows: results,
  };
}

// ── Commit ──────────────────────────────────────────────────────────────────
//
// Phase 1 – catalog (NO transaction): colors, sizes, categories, products,
//   variants + inventory balance. No long lock is held; each nested write is
//   atomic on its own. This avoids transaction timeouts on cloud DBs with
//   high per-query latency (Supabase free tier ≈ 80-500 ms per round-trip).
//
// Phase 2 – receiving (transaction per supplier): PO + items + inventory
//   movements. This is the section that truly requires atomicity.

// ── STEP 1: Catalog only (no stock) ──────────────────────────────────────────
// Creates colors, sizes, categories, products and variants. Marks the batch
// AWAITING_STOCK. No purchase orders or inventory movements happen here, so a
// failure mid-way can never leave stock half-applied.
export async function commitCatalog(
  input: CommitRequest,
  createdById: string | null,
): Promise<CatalogResult> {
  let newCategoriesCreated = 0, newColorsCreated = 0, newSizesCreated = 0;
  let newProductsCreated = 0, newVariantsCreated = 0, variantsUpdated = 0;

  // Create the batch up-front, marked AWAITING_STOCK until step 2 receives stock.
  const batch = await prisma.bulkImportBatch.create({
    data: { rowsImported: input.rows.length, createdById, status: "AWAITING_STOCK" },
  });

  // ── Phase 1: Catalog — no wrapping transaction ──────────────────────────

  // 1a. Colors
  const colorMap = new Map<string, string>();
  const pendingColors = new Map<string, string>();
  for (const row of input.rows) {
    if (row.colorIsNew && row.raw.color && !row.colorId)
      pendingColors.set(row.raw.color.toLowerCase(), row.raw.color);
  }
  for (const [key, name] of pendingColors) {
    const ex = await prisma.color.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    colorMap.set(key, ex ? ex.id : (await prisma.color.create({ data: { name } })).id);
  }
  newColorsCreated = colorMap.size;

  // 1b. Sizes
  const sizeMap = new Map<string, string>();
  const pendingSizes = new Map<string, string>();
  for (const row of input.rows) {
    if (row.sizeIsNew && row.raw.size && !row.sizeId)
      pendingSizes.set(row.raw.size.toLowerCase(), row.raw.size);
  }
  for (const [key, label] of pendingSizes) {
    const ex = await prisma.size.findFirst({ where: { label: { equals: label, mode: "insensitive" } } });
    if (ex) { sizeMap.set(key, ex.id); continue; }
    let code = label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 20);
    let n = 1;
    while (await prisma.size.findUnique({ where: { code } })) code = `${code.slice(0, 17)}_${n++}`;
    sizeMap.set(key, (await prisma.size.create({ data: { label, code } })).id);
  }
  newSizesCreated = sizeMap.size;

  // 1c. Categories
  const categoryMap = new Map<string, string>();
  const pendingCategories = new Map<string, string>();
  for (const row of input.rows) {
    if (row.categoryIsNew && row.raw.shelf_category && !row.categoryId)
      pendingCategories.set(row.raw.shelf_category.toLowerCase(), row.raw.shelf_category);
  }
  for (const [key, name] of pendingCategories) {
    const ex = await prisma.category.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (ex) { categoryMap.set(key, ex.id); continue; }
    const slug = await uniqueCategorySlug(
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    );
    categoryMap.set(key, (await prisma.category.create({ data: { name, slug } })).id);
  }
  newCategoriesCreated = categoryMap.size;

  // 1d. Products + variants
  const productMap = new Map<string, string>();

  for (const row of input.rows) {
    const r = row.raw;
    const resolvedCategory =
      row.categoryId ?? (r.shelf_category ? categoryMap.get(r.shelf_category.toLowerCase()) : undefined);
    const resolvedColor = row.colorId ?? (r.color ? colorMap.get(r.color.toLowerCase()) : undefined);
    const resolvedSize  = row.sizeId  ?? (r.size  ? sizeMap.get(r.size.toLowerCase())   : undefined);

    if (row.action === "receive_only") {
      // Existing SKU → keep the SAME variant (no duplicate) and refresh only the Excel-controlled
      // price/threshold fields (see resolveVariantMasterUpdate for the exact rules). GST and
      // product-level fields are intentionally left untouched (approved scope).
      if (row.variantId) {
        const data = resolveVariantMasterUpdate(r);
        if (Object.keys(data).length > 0) {
          await prisma.productVariant.update({ where: { id: row.variantId }, data });
          variantsUpdated++;
        }
      }
      continue;
    }

    let productId = row.productId;

    if (row.action === "create_product_and_variant") {
      const nameKey = r.product_name.toLowerCase();
      if (productMap.has(nameKey)) {
        productId = productMap.get(nameKey)!;
      } else {
        const base = r.product_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const slug = await uniqueSlug(base);
        const p = await prisma.product.create({
          data: {
            name: r.product_name, slug,
            brand: r.brand || null,
            kind: r.kind as ProductKind,
            gender: r.gender as ProductGender,
            categoryId: resolvedCategory!,
          },
        });
        productId = p.id;
        productMap.set(nameKey, p.id);
        newProductsCreated++;
      }
    }

    if (!productId) throw new Error(`Row ${row.rowNum}: no product ID resolved`);

    // Nested create: variant + inventoryBalance in one atomic implicit transaction
    await prisma.productVariant.create({
      data: {
        productId, sku: r.sku,
        listPrice: new Prisma.Decimal(r.list_price),
        costPrice: r.cost_price > 0 ? new Prisma.Decimal(r.cost_price) : null,
        gstEnabled: true,
        gstPricingMode: r.gst_inclusive ? GstPricingMode.INCLUSIVE : GstPricingMode.EXCLUSIVE,
        cgstRate: new Prisma.Decimal(r.cgst_pct),
        sgstRate: new Prisma.Decimal(r.sgst_pct),
        igstRate: new Prisma.Decimal(r.igst_pct),
        lowStockThreshold:
          r.low_stock_threshold != null ? Math.max(0, Math.floor(r.low_stock_threshold)) : null,
        colorId: resolvedColor ?? null,
        sizeId:  resolvedSize  ?? null,
        inventory: { create: { quantity: 0 } },
      },
    });
    newVariantsCreated++;
  }

  return {
    batchId: batch.id,
    rowsImported: input.rows.length,
    newCategoriesCreated,
    newColorsCreated,
    newSizesCreated,
    newProductsCreated,
    newVariantsCreated,
    variantsUpdated,
  };
}

// ── STEP 2: Receive stock against an existing catalog batch ──────────────────
// Resolves every row's variant by SKU (the catalog step created them), then
// creates one purchase order per supplier and applies inventory movements.
// Only runs once the catalog exists, so stock can never be half-applied.
export async function commitStock(
  batchId: string,
  input: CommitRequest,
  receivedById: string | null,
): Promise<StockResult> {
  type PoLine = {
    supplierId: string;
    variantId: string;
    quantity: number;
    unitCost: number;
    cgst: number; sgst: number; igst: number;
    gstInclusive: boolean;
  };

  const batch = await prisma.bulkImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new AppError(404, "BATCH_NOT_FOUND", "Import batch not found");
  if (batch.status === "COMPLETED") {
    throw new AppError(409, "ALREADY_RECEIVED", "Stock has already been received for this import");
  }
  if (batch.status === "ROLLED_BACK") {
    throw new AppError(409, "ROLLED_BACK", "This import has been rolled back");
  }

  const actorId = receivedById
    ? (await prisma.user.findUnique({ where: { id: receivedById }, select: { id: true } }))?.id ?? null
    : null;

  // Resolve every SKU to its variant (all should exist after the catalog step).
  const skus = input.rows.map((r) => r.raw.sku);
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true },
  });
  const skuToId = new Map(variants.map((v) => [v.sku.toLowerCase(), v.id]));

  const missing: string[] = [];
  const poLines: PoLine[] = [];
  for (const row of input.rows) {
    const variantId = skuToId.get(row.raw.sku.toLowerCase());
    if (!variantId) {
      missing.push(row.raw.sku);
      continue;
    }
    poLines.push({
      supplierId: row.supplierId,
      variantId,
      quantity: row.raw.quantity,
      unitCost: row.raw.cost_price,
      cgst: row.raw.cgst_pct,
      sgst: row.raw.sgst_pct,
      igst: row.raw.igst_pct,
      gstInclusive: row.raw.gst_inclusive,
    });
  }
  if (missing.length > 0) {
    throw new AppError(
      400,
      "CATALOG_INCOMPLETE",
      `These SKUs are not in the catalog yet — create the catalog first: ${missing.join(", ")}`,
    );
  }

  // Supabase cloud DB latency makes long interactive transactions infeasible;
  // each write below is atomic on its own (INSERT / atomic-delta UPDATE).
  const bySupplier = new Map<string, PoLine[]>();
  for (const l of poLines) {
    const g = bySupplier.get(l.supplierId) ?? [];
    g.push(l);
    bySupplier.set(l.supplierId, g);
  }

  const poIds: string[] = [];
  let unitsReceived = 0;

  for (const [supplierId, lines] of bySupplier) {
    const computed = lines.map((l) =>
      computeLine({
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: new Prisma.Decimal(l.unitCost),
        lineDiscount: new Prisma.Decimal(0),
        gstEnabled: true,
        gstPricingMode: l.gstInclusive ? GstPricingMode.INCLUSIVE : GstPricingMode.EXCLUSIVE,
        cgstRate: new Prisma.Decimal(l.cgst),
        sgstRate: new Prisma.Decimal(l.sgst),
        igstRate: new Prisma.Decimal(l.igst),
      }),
    );
    const totals = computeOrderTotals(computed, new Prisma.Decimal(0));

    const po = await prisma.purchaseOrder.create({
      data: {
        supplierId,
        createdById: actorId,
        bulkImportBatchId: batch.id,
        status: "ORDERED",
        orderedAt: new Date(),
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxableValueTotal: totals.taxableValue,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        igstTotal: totals.igstTotal,
        grandTotal: totals.grandTotal,
      },
    });

    // Bulk-create PO items in one round trip (received immediately, so no follow-up update).
    // Sequential per-line writes over Supabase's cloud latency were the cause of the
    // request outliving Railway's edge timeout ("Failed to fetch" while stock kept trickling in).
    await prisma.purchaseOrderItem.createMany({
      data: lines.map((l, i) => {
        const c = computed[i]!;
        const unitEx = l.quantity > 0
          ? c.taxableValue.div(l.quantity).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP)
          : new Prisma.Decimal(0);
        return {
          purchaseOrderId: po.id,
          variantId: l.variantId,
          quantityOrdered: l.quantity,
          quantityReceived: l.quantity,
          unitCost: new Prisma.Decimal(l.unitCost),
          gstEnabled: true,
          gstPricingMode: l.gstInclusive ? GstPricingMode.INCLUSIVE : GstPricingMode.EXCLUSIVE,
          cgstRate: c.cgstRate,
          sgstRate: c.sgstRate,
          igstRate: c.igstRate,
          taxableValue: c.taxableValue,
          cgstAmount: c.cgstAmount,
          sgstAmount: c.sgstAmount,
          igstAmount: c.igstAmount,
          lineTotal: c.lineTotal,
          unitCostExclusive: unitEx,
        };
      }),
    });

    // Read the created items back to reference them from inventory logs.
    const createdItems = await prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: po.id },
      select: { id: true, variantId: true, quantityOrdered: true },
    });

    // Ensure a balance row exists for every variant (one round trip; existing rows skipped).
    await prisma.inventoryBalance.createMany({
      data: [...new Set(createdItems.map((it) => it.variantId))].map((variantId) => ({
        variantId,
        quantity: 0,
      })),
      skipDuplicates: true,
    });

    // Sum inbound deltas per variant, then apply every increment in a single bulk UPDATE.
    const deltaByVariant = new Map<string, number>();
    for (const it of createdItems) {
      deltaByVariant.set(
        it.variantId,
        (deltaByVariant.get(it.variantId) ?? 0) + it.quantityOrdered,
      );
    }
    const deltaTuples = [...deltaByVariant].map(
      ([variantId, delta]) => Prisma.sql`(${variantId}::text, ${delta}::integer)`,
    );
    await prisma.$executeRaw`
      UPDATE inventory_balances AS ib
      SET quantity = ib.quantity + v.delta
      FROM (VALUES ${Prisma.join(deltaTuples)}) AS v(variant_id, delta)
      WHERE ib.variant_id = v.variant_id
    `;

    // One PURCHASE_IN log per received line, in one round trip.
    await prisma.inventoryLog.createMany({
      data: createdItems.map((it) => ({
        variantId: it.variantId,
        quantityDelta: it.quantityOrdered,
        movementType: "PURCHASE_IN" as const,
        referenceKind: "PURCHASE_ORDER" as const,
        referenceId: po.id,
        createdById: actorId,
        metadata: { purchaseOrderItemId: it.id },
      })),
    });

    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "RECEIVED", receivedAt: new Date() },
    });

    for (const it of createdItems) unitsReceived += it.quantityOrdered;
    poIds.push(po.id);
  }

  // Catalog + stock both done — the batch is now complete.
  await prisma.bulkImportBatch.update({
    where: { id: batchId },
    data: { status: "COMPLETED" },
  });

  return {
    batchId,
    purchaseOrderIds: poIds,
    rowsImported: input.rows.length,
    unitsReceived,
  };
}

// Backward-compatible single-shot: catalog then stock in one call.
export async function commitImport(
  input: CommitRequest,
  createdById: string | null,
): Promise<CommitResult> {
  const cat = await commitCatalog(input, createdById);
  const stock = await commitStock(cat.batchId, input, createdById);
  return {
    success: true,
    batchId: cat.batchId,
    purchaseOrderIds: stock.purchaseOrderIds,
    rowsImported: cat.rowsImported,
    newCategoriesCreated: cat.newCategoriesCreated,
    newColorsCreated: cat.newColorsCreated,
    newSizesCreated: cat.newSizesCreated,
    newProductsCreated: cat.newProductsCreated,
    newVariantsCreated: cat.newVariantsCreated,
  };
}

// ── List batches ─────────────────────────────────────────────────────────────

export async function listBatches(): Promise<BatchListItem[]> {
  const batches = await prisma.bulkImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      rowsImported: true,
      createdAt: true,
      rolledBackAt: true,
      _count: { select: { purchaseOrders: true } },
    },
  });

  return batches.map((b) => ({
    id: b.id,
    status: b.status,
    rowsImported: b.rowsImported,
    poCount: b._count.purchaseOrders,
    createdAt: b.createdAt.toISOString(),
    rolledBackAt: b.rolledBackAt?.toISOString() ?? null,
  }));
}

// ── Rollback batch ───────────────────────────────────────────────────────────

export async function rollbackBatch(
  batchId: string,
  rolledBackById: string | null,
): Promise<RollbackResult> {
  // 1. Load batch + all POs + all items
  const batch = await prisma.bulkImportBatch.findUnique({
    where: { id: batchId },
    include: {
      purchaseOrders: {
        include: {
          items: { select: { id: true, variantId: true, quantityReceived: true } },
        },
      },
    },
  });

  if (!batch) throw new AppError(404, "BATCH_NOT_FOUND", "Import batch not found");
  if (batch.status === "ROLLED_BACK") {
    throw new AppError(409, "ALREADY_ROLLED_BACK", "This import has already been rolled back");
  }

  // 2. Gather every unique variantId that had stock received
  const allItems = batch.purchaseOrders.flatMap((po) => po.items);
  const receivedItems = allItems.filter((i) => i.quantityReceived > 0);
  const variantIds = [...new Set(receivedItems.map((i) => i.variantId))];

  if (variantIds.length === 0) {
    // Nothing was received — just mark rolled back
    await prisma.bulkImportBatch.update({
      where: { id: batchId },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date(), rolledBackById },
    });
    return { success: true, batchId, posReverted: 0, unitsReturned: 0 };
  }

  // 3. Check: net units sold (SALE_OUT + EXCHANGE_OUT, offset by RETURN_RESTOCK_IN + SALE_REVERSAL_IN)
  //    after this batch was created. Net < 0 means stock was removed (i.e., sold).
  const saleLogs = await prisma.inventoryLog.groupBy({
    by: ["variantId"],
    where: {
      variantId: { in: variantIds },
      createdAt: { gt: batch.createdAt },
      movementType: { in: ["SALE_OUT", "EXCHANGE_OUT", "RETURN_RESTOCK_IN", "SALE_REVERSAL_IN"] },
    },
    _sum: { quantityDelta: true },
  });

  const soldVariants = saleLogs.filter((r) => (r._sum.quantityDelta ?? 0) < 0);
  if (soldVariants.length > 0) {
    // Fetch product names for the error message
    const soldVariantIds = soldVariants.map((r) => r.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: soldVariantIds } },
      select: { id: true, sku: true, product: { select: { name: true } } },
    });

    const details = soldVariants.map((r) => {
      const v = variants.find((pv) => pv.id === r.variantId);
      const netSold = Math.abs(r._sum.quantityDelta ?? 0);
      return `${v?.product.name ?? "Unknown"} (${v?.sku ?? r.variantId}) — ${netSold} unit${netSold !== 1 ? "s" : ""} sold`;
    });

    throw new AppError(
      409,
      "ITEMS_SOLD_AFTER_IMPORT",
      `Cannot rollback — the following items have been sold since this import:\n${details.join("\n")}`,
    );
  }

  // 4. Reverse inventory: ADJUSTMENT_OUT for each received item, then cancel POs
  let unitsReturned = 0;

  for (const po of batch.purchaseOrders) {
    for (const item of po.items) {
      if (item.quantityReceived <= 0) continue;

      // Subtract from balance
      await prisma.inventoryBalance.updateMany({
        where: { variantId: item.variantId },
        data: { quantity: { increment: -item.quantityReceived } },
      });

      // Audit log for the reversal
      await prisma.inventoryLog.create({
        data: {
          variantId: item.variantId,
          quantityDelta: -item.quantityReceived,
          movementType: "ADJUSTMENT_OUT",
          referenceKind: "PURCHASE_ORDER",
          referenceId: po.id,
          note: `Bulk import rollback — batch ${batchId}`,
          createdById: rolledBackById,
        },
      });

      // Zero out received qty on the item
      await prisma.purchaseOrderItem.update({
        where: { id: item.id },
        data: { quantityReceived: 0 },
      });

      unitsReturned += item.quantityReceived;
    }

    // Cancel the PO
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "CANCELLED" },
    });
  }

  // 5. Mark batch as rolled back
  await prisma.bulkImportBatch.update({
    where: { id: batchId },
    data: { status: "ROLLED_BACK", rolledBackAt: new Date(), rolledBackById },
  });

  return {
    success: true,
    batchId,
    posReverted: batch.purchaseOrders.length,
    unitsReturned,
  };
}
