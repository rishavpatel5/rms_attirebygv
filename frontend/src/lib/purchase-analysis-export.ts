import * as XLSX from "xlsx";
import type { PurchaseAnalysisResponse, PurchaseAnalysisRow } from "./analytics-api";

const STATUS_LABELS: Record<PurchaseAnalysisRow["status"], string> = {
  OUT_OF_STOCK: "Out of stock",
  CRITICAL: "Critical",
  ABOUT_TO_FINISH: "About to finish",
  FAST_MOVING_LOW: "Fast moving (low)",
  LOW_STOCK: "Low stock",
};

function sheetFromRows(rows: (string | number | boolean | null | undefined)[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

function triggerDownload(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPurchaseAnalysisSheet(data: PurchaseAnalysisResponse): void {
  const header = [
    "Priority",
    "Status",
    "SKU",
    "Brand",
    "Product",
    "Variant",
    "Kind",
    "Current stock",
    "Threshold",
    `Units sold (${data.trendDays}d)`,
    "Avg daily sales",
    "Days of stock left",
    "Fast moving",
    "Suggested reorder qty",
    "Analysis note",
  ];

  const rows: (string | number | boolean | null)[][] = data.items.map((r) => [
    r.priority,
    STATUS_LABELS[r.status],
    r.sku,
    r.brand ?? "—",
    r.productName,
    r.variantLabel,
    r.productKind,
    r.currentStock,
    r.threshold,
    r.unitsSold,
    r.avgDailySales,
    r.daysOfStockLeft ?? "—",
    r.isFastMoving ? "Yes" : "No",
    r.suggestedReorderQty,
    r.analysisNote,
  ]);

  const summaryRows: (string | number)[][] = [
    ["Purchase analysis summary"],
    ["Sales trend window", `${data.trendFrom} → ${data.trendTo} (${data.trendDays} days)`],
    ["Reorder cover (days)", data.coverDays],
    ["Out of stock", data.summary.outOfStock],
    ["Critical", data.summary.critical],
    ["About to finish", data.summary.aboutToFinish],
    ["Fast moving (low)", data.summary.fastMovingLow],
    ["Low stock", data.summary.lowStock],
    ["Total SKUs to reorder", data.summary.totalSkus],
    ["Total suggested units", data.summary.totalSuggestedUnits],
    [],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows([...summaryRows, header, ...rows]), "Purchase analysis");
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  triggerDownload(buffer, `purchase_analysis_${data.trendTo}.xlsx`);
}
