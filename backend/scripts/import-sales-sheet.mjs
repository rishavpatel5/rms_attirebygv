/**
 * Import historical POS sales from Sheet1 of attirebygv_Sales.xlsx.
 *
 * Rules:
 * - A normal uncolored row is one bill.
 * - Consecutive green rows are one multi-item bill; the following red Total row carries
 *   payment method and bill total.
 * - SKU is matched after removing leading quotes/backticks and uppercasing.
 * - Sheet MRP is the amount charged for that SKU. If it is below the system list_price,
 *   the difference is stored as item/line discount.
 * - FREE rows are zero-value sales with full item discount and stock deducted.
 *
 * Usage:
 *   node scripts/import-sales-sheet.mjs          # preview
 *   node scripts/import-sales-sheet.mjs --apply  # import
 */
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  InventoryReferenceKind,
  OrderDocumentType,
  OrderStatus,
  PaymentNature,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(here, "..", ".env") });

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const FILE = "C:\\Users\\Rishav Patel\\Downloads\\attirebygv_Sales.xlsx";
const GREEN = "B6D7A8";
const RED = "EA9999";

const D2 = (d) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const D4 = (d) => d.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

function cleanSku(value) {
  return typeof value === "string" ? value.replace(/^[`'"]+/, "").trim().toUpperCase() : null;
}

function cleanString(value) {
  return value == null ? null : String(value).trim() || null;
}

function normalizePhone(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length < 10) return null;
  if (d.length > 10) d = d.slice(-10);
  return d;
}

function parseSheetDate(value) {
  if (value instanceof Date) return value;
  const text = cleanString(value);
  if (!text) return new Date();
  const m = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (!m) return new Date(text);
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const rawYear = Number(m[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

function parseAmount(value) {
  if (typeof value === "number") return new Prisma.Decimal(value);
  const text = cleanString(value);
  if (!text) return new Prisma.Decimal(0);
  if (text.toUpperCase() === "FREE") return new Prisma.Decimal(0);
  return new Prisma.Decimal(text.replace(/,/g, ""));
}

function paymentMethod(value) {
  const text = cleanString(value)?.toUpperCase();
  if (text === "CASH") return "CASH";
  if (text === "UPI") return "UPI";
  if (text === "CARD") return "CARD";
  if (text === "BANK_TRANSFER") return "BANK_TRANSFER";
  if (text === "WALLET") return "WALLET";
  return "OTHER";
}

function cell(sheet, row, col) {
  return sheet[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })];
}

function value(sheet, row, col) {
  const v = cell(sheet, row, col)?.v ?? null;
  return v instanceof Date ? v : v;
}

function fill(sheet, row, col) {
  const fg = cell(sheet, row, col)?.s?.fgColor;
  if (!fg) return null;
  if (fg.rgb) return fg.rgb;
  if (fg.theme !== undefined) return `theme:${fg.theme}:${fg.tint ?? 0}`;
  if (fg.indexed !== undefined) return `indexed:${fg.indexed}`;
  return null;
}

function rowFill(sheet, row, maxColumn) {
  const counts = new Map();
  for (let col = 1; col <= maxColumn; col++) {
    const f = fill(sheet, row, col);
    if (!f) continue;
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  let best = null;
  for (const [f, count] of counts) {
    if (!best || count > best.count) best = { fill: f, count };
  }
  return best?.fill ?? null;
}

function loadBills() {
  const workbook = XLSX.readFile(FILE, { cellDates: true, cellStyles: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows = [];

  for (let row = 3; row <= range.e.r + 1; row++) {
    const values = [];
    let nonEmpty = false;
    for (let col = 1; col <= 7; col++) {
      const v = value(sheet, row, col);
      values.push(v);
      if (v !== null && v !== "") nonEmpty = true;
    }
    if (!nonEmpty) continue;
    rows.push({ row, fill: rowFill(sheet, row, range.e.c + 1), values });
  }

  const bills = [];
  let i = 0;
  while (i < rows.length) {
    const current = rows[i];
    const [srNo, customerName, phone, date, amount, pay, sku] = current.values;

    if (current.fill !== GREEN) {
      if (cleanString(customerName) === "Total") {
        i++;
        continue;
      }
      bills.push({
        sheetStartRow: current.row,
        sheetEndRow: current.row,
        srNo,
        customerName: cleanString(customerName),
        phone: normalizePhone(phone),
        date: parseSheetDate(date),
        paymentMethod: paymentMethod(pay),
        sheetTotal: parseAmount(amount),
        lines: [{ sheetRow: current.row, sku: cleanSku(sku), chargedAmount: parseAmount(amount), rawAmount: amount }],
      });
      i++;
      continue;
    }

    const bill = {
      sheetStartRow: current.row,
      sheetEndRow: current.row,
      srNo,
      customerName: cleanString(customerName),
      phone: normalizePhone(phone),
      date: parseSheetDate(date),
      paymentMethod: "OTHER",
      sheetTotal: new Prisma.Decimal(0),
      lines: [],
    };
    while (i < rows.length && rows[i].fill === GREEN) {
      const row = rows[i];
      bill.sheetEndRow = row.row;
      bill.lines.push({
        sheetRow: row.row,
        sku: cleanSku(row.values[6]),
        chargedAmount: parseAmount(row.values[4]),
        rawAmount: row.values[4],
      });
      i++;
    }
    if (i < rows.length && rows[i].fill === RED && cleanString(rows[i].values[1]) === "Total") {
      bill.sheetEndRow = rows[i].row;
      bill.sheetTotal = parseAmount(rows[i].values[4]);
      bill.paymentMethod = paymentMethod(rows[i].values[5]);
      i++;
    } else {
      bill.sheetTotal = bill.lines.reduce((sum, line) => sum.plus(line.chargedAmount), new Prisma.Decimal(0));
    }
    bills.push(bill);
  }

  return bills;
}

function computeLine(input) {
  const qty = new Prisma.Decimal(input.quantity);
  const gross = D4(qty.mul(input.unitPrice));
  const discount = D4(input.lineDiscount.gt(gross) ? gross : input.lineDiscount);
  const afterDiscount = D4(gross.minus(discount));
  const totalRate = D4(input.cgstRate.plus(input.sgstRate).plus(input.igstRate));

  let taxableValue;
  let lineTotal;
  if (!input.gstEnabled || totalRate.eq(0)) {
    taxableValue = afterDiscount;
    lineTotal = afterDiscount;
  } else if (input.gstPricingMode === "INCLUSIVE") {
    taxableValue = D4(afterDiscount.div(new Prisma.Decimal(1).plus(totalRate.div(100))));
    lineTotal = afterDiscount;
  } else {
    taxableValue = afterDiscount;
    lineTotal = D4(taxableValue.plus(taxableValue.mul(totalRate).div(100)));
  }

  const cgstAmount = input.gstEnabled ? D4(taxableValue.mul(input.cgstRate).div(100)) : new Prisma.Decimal(0);
  const sgstAmount = input.gstEnabled ? D4(taxableValue.mul(input.sgstRate).div(100)) : new Prisma.Decimal(0);
  const igstAmount = input.gstEnabled ? D4(taxableValue.mul(input.igstRate).div(100)) : new Prisma.Decimal(0);

  if (input.gstEnabled && input.gstPricingMode === "INCLUSIVE") {
    // Inclusive MRP is the amount charged in the sheet; keep line totals tied to that
    // amount and let taxable/GST carry the rounded split.
    lineTotal = afterDiscount;
  }

  return {
    ...input,
    grossAmount: gross,
    itemDiscountType: discount.gt(0) ? "FLAT_AMOUNT" : null,
    itemDiscountValue: discount.gt(0) ? discount : null,
    itemDiscountAmount: discount,
    cartDiscountAllocated: new Prisma.Decimal(0),
    lineDiscount: discount,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    lineTotal,
  };
}

function computeTotals(lines) {
  const totals = {
    grossSubtotal: new Prisma.Decimal(0),
    itemDiscountTotal: new Prisma.Decimal(0),
    taxableValue: new Prisma.Decimal(0),
    cgstTotal: new Prisma.Decimal(0),
    sgstTotal: new Prisma.Decimal(0),
    igstTotal: new Prisma.Decimal(0),
    grandTotal: new Prisma.Decimal(0),
  };
  for (const line of lines) {
    totals.grossSubtotal = totals.grossSubtotal.plus(line.grossAmount);
    totals.itemDiscountTotal = totals.itemDiscountTotal.plus(line.itemDiscountAmount);
    totals.taxableValue = totals.taxableValue.plus(line.taxableValue);
    totals.cgstTotal = totals.cgstTotal.plus(line.cgstAmount);
    totals.sgstTotal = totals.sgstTotal.plus(line.sgstAmount);
    totals.igstTotal = totals.igstTotal.plus(line.igstAmount);
    totals.grandTotal = totals.grandTotal.plus(line.lineTotal);
  }
  return {
    subtotal: D2(totals.grossSubtotal),
    discountTotal: D2(totals.itemDiscountTotal),
    itemDiscountTotal: D2(totals.itemDiscountTotal),
    taxableValue: D2(totals.taxableValue),
    cgstTotal: D2(totals.cgstTotal),
    sgstTotal: D2(totals.sgstTotal),
    igstTotal: D2(totals.igstTotal),
    cessTotal: new Prisma.Decimal(0),
    grandTotal: D2(totals.grandTotal),
    roundingAdjustment: D2(D2(totals.grandTotal).minus(totals.grandTotal)),
  };
}

async function allocateInvoiceNumber(tx) {
  try {
    const updated = await tx.invoiceSequence.update({
      where: { id: "singleton" },
      data: { nextSeq: { increment: 1 } },
      select: { nextSeq: true },
    });
    return `INV-${new Date().getUTCFullYear()}-${String(updated.nextSeq).padStart(7, "0")}`;
  } catch (e) {
    if (e?.code !== "P2025") throw e;
    await tx.invoiceSequence.create({ data: { id: "singleton", nextSeq: 0 } });
    return allocateInvoiceNumber(tx);
  }
}

async function resolveCustomer(tx, bill) {
  const name = bill.customerName?.trim() || (bill.phone ? `Customer ${bill.phone}` : "");
  if (!name && !bill.phone) return { customerId: null, isWalkIn: true };
  if (bill.phone) {
    const existing = await tx.customer.findUnique({ where: { phone: bill.phone } });
    if (existing) {
      if (name) await tx.customer.update({ where: { id: existing.id }, data: { fullName: name } });
      return { customerId: existing.id, isWalkIn: false };
    }
    const created = await tx.customer.create({ data: { fullName: name, phone: bill.phone } });
    return { customerId: created.id, isWalkIn: false };
  }
  const created = await tx.customer.create({ data: { fullName: name, phone: null } });
  return { customerId: created.id, isWalkIn: false };
}

async function applySaleOut(tx, orderId, lines) {
  const quantities = new Map();
  for (const line of lines) {
    quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
  }
  const sorted = [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [variantId, quantity] of sorted) {
    await tx.inventoryBalance.upsert({
      where: { variantId },
      create: { variantId, quantity: 0 },
      update: {},
    });
    const updated = await tx.inventoryBalance.updateMany({
      where: { variantId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (updated.count !== 1) {
      throw new Error(`INSUFFICIENT_STOCK for ${variantId}`);
    }
    await tx.inventoryLog.create({
      data: {
        variantId,
        quantityDelta: -quantity,
        movementType: "SALE_OUT",
        referenceKind: InventoryReferenceKind.ORDER,
        referenceId: orderId,
        metadata: { orderId, source: "sales_sheet_import" },
        createdById: null,
      },
    });
  }
}

async function prepareBills(bills) {
  const skus = [...new Set(bills.flatMap((b) => b.lines.map((l) => l.sku)).filter(Boolean))];
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: skus }, isActive: true },
    select: {
      id: true,
      sku: true,
      listPrice: true,
      costPrice: true,
      gstEnabled: true,
      gstPricingMode: true,
      cgstRate: true,
      sgstRate: true,
      igstRate: true,
    },
  });
  const variantBySku = new Map(variants.map((variant) => [variant.sku, variant]));
  const missing = skus.filter((sku) => !variantBySku.has(sku));
  if (missing.length) throw new Error(`Missing SKUs: ${missing.join(", ")}`);

  return bills.map((bill) => {
    const preparedLines = bill.lines.map((line) => {
      const variant = variantBySku.get(line.sku);
      const systemPrice = new Prisma.Decimal(variant.listPrice);
      const charged = line.chargedAmount;
      const unitPrice = systemPrice.gt(charged) ? systemPrice : charged;
      const discount = unitPrice.gt(charged) ? unitPrice.minus(charged) : new Prisma.Decimal(0);
      return computeLine({
        variantId: variant.id,
        sku: variant.sku,
        quantity: 1,
        unitPrice,
        lineDiscount: discount,
        gstEnabled: variant.gstEnabled,
        gstPricingMode: variant.gstPricingMode,
        cgstRate: new Prisma.Decimal(variant.cgstRate),
        sgstRate: new Prisma.Decimal(variant.sgstRate),
        igstRate: new Prisma.Decimal(variant.igstRate),
        unitCostSnapshot: variant.costPrice ? new Prisma.Decimal(variant.costPrice) : null,
        sheetRow: line.sheetRow,
        sheetAmount: charged,
        rawAmount: line.rawAmount,
      });
    });
    const totals = computeTotals(preparedLines);
    return {
      ...bill,
      idempotencyKey: `sales-sheet1-${bill.sheetStartRow}-${bill.sheetEndRow}`,
      lines: preparedLines,
      totals,
      computedTotal: totals.grandTotal,
    };
  });
}

async function importBill(bill) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { idempotencyKey: bill.idempotencyKey },
      select: { id: true, invoiceNumber: true },
    });
    if (existing) return { skipped: true, orderId: existing.id, invoiceNumber: existing.invoiceNumber };

    const { customerId, isWalkIn } = await resolveCustomer(tx, bill);
    const invoiceNumber = await allocateInvoiceNumber(tx);
    const order = await tx.order.create({
      data: {
        documentType: OrderDocumentType.SALE,
        status: OrderStatus.CONFIRMED,
        invoiceNumber,
        customerId,
        isWalkIn,
        gstEnabled: bill.lines.some((line) => line.gstEnabled),
        gstPricingMode: "INCLUSIVE",
        currency: "INR",
        subtotal: bill.totals.subtotal,
        discountTotal: bill.totals.discountTotal,
        itemDiscountTotal: bill.totals.itemDiscountTotal,
        cartDiscountType: null,
        cartDiscountValue: null,
        cartDiscountAmount: new Prisma.Decimal(0),
        taxableValue: bill.totals.taxableValue,
        cgstTotal: bill.totals.cgstTotal,
        sgstTotal: bill.totals.sgstTotal,
        igstTotal: bill.totals.igstTotal,
        cessTotal: bill.totals.cessTotal,
        grandTotal: bill.totals.grandTotal,
        roundingAdjustment: bill.totals.roundingAdjustment,
        notes: `Imported from attirebygv_Sales.xlsx Sheet1 rows ${bill.sheetStartRow}-${bill.sheetEndRow}`,
        idempotencyKey: bill.idempotencyKey,
        createdById: null,
        confirmedAt: bill.date,
        createdAt: bill.date,
        updatedAt: bill.date,
        items: {
          create: bill.lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            itemDiscountType: line.itemDiscountType,
            itemDiscountValue: line.itemDiscountValue,
            itemDiscountAmount: line.itemDiscountAmount,
            cartDiscountAllocated: line.cartDiscountAllocated,
            lineDiscount: line.lineDiscount,
            taxableValue: line.taxableValue,
            cgstRate: line.cgstRate,
            sgstRate: line.sgstRate,
            igstRate: line.igstRate,
            cgstAmount: line.cgstAmount,
            sgstAmount: line.sgstAmount,
            igstAmount: line.igstAmount,
            lineTotal: line.lineTotal,
            isGiveaway: false,
            giveawayReason: null,
            unitCostSnapshot: null,
          })),
        },
        payments: {
          create: [{
            method: bill.paymentMethod,
            amount: bill.totals.grandTotal,
            nature: PaymentNature.RECEIPT,
            status: PaymentStatus.COMPLETED,
            metadata: {
              source: "sales_sheet_import",
              sheetRows: `${bill.sheetStartRow}-${bill.sheetEndRow}`,
              sheetTotal: bill.sheetTotal.toFixed(2),
            },
            createdAt: bill.date,
            updatedAt: bill.date,
          }],
        },
      },
      select: { id: true, invoiceNumber: true },
    });

    await applySaleOut(tx, order.id, bill.lines);
    return { skipped: false, orderId: order.id, invoiceNumber: order.invoiceNumber };
  }, { maxWait: 10_000, timeout: 30_000 });
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW"}`);
  const rawBills = loadBills();
  const bills = await prepareBills(rawBills);
  const uniqueSkus = new Set(bills.flatMap((b) => b.lines.map((l) => l.sku)));
  const paidLines = bills.flatMap((b) => b.lines).filter((l) => l.sheetAmount.gt(0)).length;
  const freeLines = bills.flatMap((b) => b.lines).filter((l) => l.sheetAmount.eq(0)).length;

  let sheetTotal = new Prisma.Decimal(0);
  let computedTotal = new Prisma.Decimal(0);
  let discountTotal = new Prisma.Decimal(0);
  const mismatches = [];
  for (const bill of bills) {
    sheetTotal = sheetTotal.plus(bill.sheetTotal);
    computedTotal = computedTotal.plus(bill.computedTotal);
    discountTotal = discountTotal.plus(bill.totals.discountTotal);
    if (!D2(bill.sheetTotal).equals(D2(bill.computedTotal))) {
      mismatches.push({
        rows: `${bill.sheetStartRow}-${bill.sheetEndRow}`,
        customer: bill.customerName,
        sheet: bill.sheetTotal.toFixed(2),
        computed: bill.computedTotal.toFixed(2),
      });
    }
  }

  console.log(`Bills: ${bills.length}`);
  console.log(`Sale lines: ${paidLines + freeLines} (${paidLines} paid, ${freeLines} free)`);
  console.log(`Unique SKUs: ${uniqueSkus.size}`);
  console.log(`Sheet total: ${D2(sheetTotal).toFixed(2)}`);
  console.log(`Computed bill total: ${D2(computedTotal).toFixed(2)}`);
  console.log(`Discount total: ${D2(discountTotal).toFixed(2)}`);
  console.log(`Bill total mismatches: ${mismatches.length}`);
  for (const mismatch of mismatches.slice(0, 20)) {
    console.log(`  rows ${mismatch.rows} ${mismatch.customer}: sheet=${mismatch.sheet} computed=${mismatch.computed}`);
  }

  for (const bill of bills.slice(0, 5)) {
    const lines = bill.lines.map((line) => `${line.sku} price=${line.unitPrice} charged=${line.sheetAmount} discount=${line.lineDiscount}`).join(", ");
    console.log(`  preview rows ${bill.sheetStartRow}-${bill.sheetEndRow} ${bill.customerName}: ${lines}`);
  }

  if (!APPLY) {
    console.log("Preview only. Re-run with --apply to import.");
    return;
  }

  let imported = 0;
  let skipped = 0;
  for (const bill of bills) {
    const result = await importBill(bill);
    if (result.skipped) skipped++;
    else imported++;
  }
  console.log(`Imported bills: ${imported}`);
  console.log(`Skipped existing bills: ${skipped}`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
