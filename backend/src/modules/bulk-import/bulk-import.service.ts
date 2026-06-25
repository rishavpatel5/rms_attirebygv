import { GstPricingMode, Prisma, ProductGender, ProductKind } from "@prisma/client";
import { read as xlsxRead, utils as xlsxUtils } from "xlsx";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { computeLine, computeOrderTotals } from "../../lib/gst-calculator.js";

const EXPECTED_HEADERS = [
  "sr_no", "product_name", "sku", "shelf_category", "kind", "gender",
  "brand", "color", "size", "quantity", "cost_price", "list_price",
  "cgst_pct", "sgst_pct", "igst_pct", "low_stock_threshold",
  "supplier_name", "gst_inclusive",
] as const;

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

export type BatchListItem = {
  id: string;
  status: "COMPLETED" | "ROLLED_BACK";
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
    const kind = strCell(row[4]).toUpperCase();
    const gender = strCell(row[5]).toUpperCase();
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
    if (isNaN(cost_price) || cost_price < 0) errors.push("Cost price must be ≥ 0");
    if (isNaN(list_price) || list_price < 0) errors.push("List price must be ≥ 0");

    const KINDS = ["APPAREL", "FOOTWEAR", "ACCESSORY"];
    const GENDERS = ["MALE", "FEMALE", "UNISEX", "KIDS"];
    if (!KINDS.includes(kind)) errors.push(`Kind must be one of: ${KINDS.join(", ")}`);
    if (!GENDERS.includes(gender)) errors.push(`Gender must be one of: ${GENDERS.join(", ")}`);

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

export async function commitImport(
  input: CommitRequest,
  createdById: string | null,
): Promise<CommitResult> {
  type PoLine = {
    supplierId: string;
    variantId: string;
    quantity: number;
    unitCost: number;
    cgst: number; sgst: number; igst: number;
    gstInclusive: boolean;
  };

  let newCategoriesCreated = 0, newColorsCreated = 0, newSizesCreated = 0;
  let newProductsCreated = 0, newVariantsCreated = 0;
  const poLines: PoLine[] = [];

  // Create the batch record up-front so POs can reference it
  const batch = await prisma.bulkImportBatch.create({
    data: { rowsImported: input.rows.length, createdById, status: "COMPLETED" },
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
  const actorId = createdById
    ? (await prisma.user.findUnique({ where: { id: createdById }, select: { id: true } }))?.id ?? null
    : null;

  for (const row of input.rows) {
    const r = row.raw;
    const resolvedCategory =
      row.categoryId ?? (r.shelf_category ? categoryMap.get(r.shelf_category.toLowerCase()) : undefined);
    const resolvedColor = row.colorId ?? (r.color ? colorMap.get(r.color.toLowerCase()) : undefined);
    const resolvedSize  = row.sizeId  ?? (r.size  ? sizeMap.get(r.size.toLowerCase())   : undefined);

    let variantId: string;

    if (row.action === "receive_only" && row.variantId) {
      variantId = row.variantId;
    } else {
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
      const v = await prisma.productVariant.create({
        data: {
          productId, sku: r.sku,
          listPrice: new Prisma.Decimal(r.list_price),
          costPrice: r.cost_price > 0 ? new Prisma.Decimal(r.cost_price) : null,
          gstEnabled: true,
          gstPricingMode: r.gst_inclusive ? GstPricingMode.INCLUSIVE : GstPricingMode.EXCLUSIVE,
          cgstRate: new Prisma.Decimal(r.cgst_pct),
          sgstRate: new Prisma.Decimal(r.sgst_pct),
          igstRate: new Prisma.Decimal(r.igst_pct),
          lowStockThreshold: r.low_stock_threshold ?? null,
          colorId: resolvedColor ?? null,
          sizeId:  resolvedSize  ?? null,
          inventory: { create: { quantity: 0 } },
        },
      });
      variantId = v.id;
      newVariantsCreated++;
    }

    poLines.push({
      supplierId: row.supplierId,
      variantId,
      quantity: r.quantity,
      unitCost: r.cost_price,
      cgst: r.cgst_pct,
      sgst: r.sgst_pct,
      igst: r.igst_pct,
      gstInclusive: r.gst_inclusive,
    });
  }

  // ── Phase 2: PO + receiving (no wrapping transaction) ───────────────────
  //
  // Supabase cloud DB latency (~200-500 ms per query) makes long-running
  // Prisma interactive transactions infeasible for large import batches.
  // Each individual write below is atomic on its own:
  //   • purchaseOrder.create / update    → single SQL INSERT / UPDATE
  //   • purchaseOrderItem.create/update  → single SQL INSERT / UPDATE
  //   • inventoryBalance.updateMany      → single SQL UPDATE (atomic delta)
  //   • inventoryLog.create              → single SQL INSERT
  // The trade-off: if the server crashes mid-import the PO may be partial,
  // but the scan→commit flow is admin-only and any partial state is visible
  // and correctable via the Purchases page.

  const bySupplier = new Map<string, PoLine[]>();
  for (const l of poLines) {
    const g = bySupplier.get(l.supplierId) ?? [];
    g.push(l);
    bySupplier.set(l.supplierId, g);
  }

  const poIds: string[] = [];

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

    const poItems: { id: string; variantId: string; quantity: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      const c = computed[i]!;
      const unitEx = l.quantity > 0
        ? c.taxableValue.div(l.quantity).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP)
        : new Prisma.Decimal(0);

      const item = await prisma.purchaseOrderItem.create({
        data: {
          purchaseOrderId: po.id,
          variantId: l.variantId,
          quantityOrdered: l.quantity,
          quantityReceived: 0,
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
        },
      });
      poItems.push({ id: item.id, variantId: item.variantId, quantity: item.quantityOrdered });
    }

    // Process movements in variantId order (avoids row-level lock ordering issues if ever re-added to a tx)
    const sorted = [...poItems].sort((a, b) => a.variantId.localeCompare(b.variantId));
    for (const it of sorted) {
      // Ensure balance row exists (upsert is safe outside tx — single atomic SQL UPSERT)
      await prisma.inventoryBalance.upsert({
        where: { variantId: it.variantId },
        create: { variantId: it.variantId, quantity: 0 },
        update: {},
      });
      // Apply delta (single atomic SQL UPDATE)
      await prisma.inventoryBalance.updateMany({
        where: { variantId: it.variantId },
        data: { quantity: { increment: it.quantity } },
      });
      // Record movement log
      await prisma.inventoryLog.create({
        data: {
          variantId: it.variantId,
          quantityDelta: it.quantity,
          movementType: "PURCHASE_IN",
          referenceKind: "PURCHASE_ORDER",
          referenceId: po.id,
          createdById: actorId,
          metadata: { purchaseOrderItemId: it.id },
        },
      });
      await prisma.purchaseOrderItem.update({
        where: { id: it.id },
        data: { quantityReceived: it.quantity },
      });
    }

    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "RECEIVED", receivedAt: new Date() },
    });

    poIds.push(po.id);
  }

  return {
    success: true,
    batchId: batch.id,
    purchaseOrderIds: poIds,
    rowsImported: input.rows.length,
    newCategoriesCreated,
    newColorsCreated,
    newSizesCreated,
    newProductsCreated,
    newVariantsCreated,
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
