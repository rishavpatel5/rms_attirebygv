import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStoredAccessToken } from "@/lib/api-client";
import {
  fetchPurchaseAnalysis,
  type PurchaseAnalysisResponse,
  type PurchaseAnalysisRow,
  type PurchaseAnalysisStatus,
  type TrendDaysOption,
} from "@/lib/analytics-api";
import { downloadPurchaseAnalysisSheet } from "@/lib/purchase-analysis-export";
import { cn } from "@/lib/utils";

const TREND_OPTIONS: { value: TrendDaysOption; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
];

const STATUS_LABELS: Record<PurchaseAnalysisStatus, string> = {
  OUT_OF_STOCK: "Out of stock",
  CRITICAL: "Critical",
  ABOUT_TO_FINISH: "About to finish",
  FAST_MOVING_LOW: "Fast moving",
  LOW_STOCK: "Low stock",
};

const STATUS_STYLES: Record<PurchaseAnalysisStatus, string> = {
  OUT_OF_STOCK: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  CRITICAL: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  ABOUT_TO_FINISH: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  FAST_MOVING_LOW: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  LOW_STOCK: "bg-muted text-muted-foreground",
};

function AnalysisCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: string;
}) {
  return (
    <Card className={cn("border-border/60 border-l-[3px] shadow-sm", accent ?? "border-l-primary/50")}>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: PurchaseAnalysisStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PurchaseAnalysisPage() {
  const [trendDays, setTrendDays] = useState<TrendDaysOption>(30);
  const [appliedTrend, setAppliedTrend] = useState<TrendDaysOption>(30);
  const [data, setData] = useState<PurchaseAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  const load = useCallback(async (days: TrendDaysOption) => {
    setLoading(true);
    setErr(null);
    try {
      const out = await fetchPurchaseAnalysis({ trendDays: days, coverDays: 14 });
      setData(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load purchase analysis");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(appliedTrend);
  }, [appliedTrend, load]);

  const applyTrend = () => setAppliedTrend(trendDays);

  const handleDownload = () => {
    if (!data) return;
    setExportBusy(true);
    try {
      downloadPurchaseAnalysisSheet(data);
    } finally {
      setExportBusy(false);
    }
  };

  const authed = Boolean(getStoredAccessToken());
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Purchase analysis</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Live reorder intelligence from current stock and confirmed POS sales. Updates automatically
            when you receive stock, sell, or adjust inventory — no static snapshot.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void load(appliedTrend)} disabled={loading}>
            <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button type="button" onClick={handleDownload} disabled={!data || exportBusy || loading}>
            {exportBusy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Download sheet
          </Button>
          <Button type="button" asChild>
            <Link to="/dashboard/purchases">
              <ShoppingCart className="mr-2 size-4" />
              Receive stock
            </Link>
          </Button>
        </div>
      </div>

      {!authed ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            <Link to="/login?redirect=/dashboard/purchase-analysis" className="underline">
              Sign in
            </Link>{" "}
            to load purchase analysis.
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sales trend window</CardTitle>
          <CardDescription>
            Used to compute average daily sales, fast-moving SKUs, and days-until-stockout.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="trend-days">Period</Label>
            <select
              id="trend-days"
              className="flex h-10 w-44 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={trendDays}
              onChange={(e) => setTrendDays(Number(e.target.value) as TrendDaysOption)}
            >
              {TREND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={applyTrend} disabled={trendDays === appliedTrend && !loading}>
            Apply
          </Button>
          {data ? (
            <p className="text-sm text-muted-foreground">
              Analysing sales {data.trendFrom} → {data.trendTo} · reorder cover {data.coverDays} days
            </p>
          ) : null}
        </CardContent>
      </Card>

      {err ? <p className="text-sm text-destructive">{err}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AnalysisCard
          label="Out of stock"
          value={summary?.outOfStock ?? 0}
          hint="Qty = 0 — compulsory reorder"
          accent="border-l-rose-500/70"
        />
        <AnalysisCard
          label="Critical"
          value={summary?.critical ?? 0}
          hint="1–2 left + fast-moving or urgent trend"
          accent="border-l-orange-500/70"
        />
        <AnalysisCard
          label="About to finish"
          value={summary?.aboutToFinish ?? 0}
          hint="Projected stockout within ~7 days"
          accent="border-l-amber-500/70"
        />
        <AnalysisCard
          label="Fast moving (low)"
          value={summary?.fastMovingLow ?? 0}
          hint="Top sellers below threshold"
          accent="border-l-sky-500/70"
        />
        <AnalysisCard
          label="Suggested units"
          value={summary?.totalSuggestedUnits ?? 0}
          hint={`${summary?.totalSkus ?? 0} SKUs need attention`}
          accent="border-l-primary/70"
        />
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Reorder table</CardTitle>
          <CardDescription>
            Sorted by urgency. Stock 0 always included; 1–2 units classified by sales velocity; fast movers
            and trend-based stockout risk surfaced automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading analysis…</p>
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reorder recommendations for this trend window. Stock levels look healthy.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Avg/day</TableHead>
                  <TableHead className="text-right">Days left</TableHead>
                  <TableHead className="text-right">Reorder qty</TableHead>
                  <TableHead>Analysis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row: PurchaseAnalysisRow) => (
                  <TableRow key={row.variantId}>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.variantLabel}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.currentStock}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.unitsSold}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.avgDailySales}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.daysOfStockLeft === null ? "—" : row.daysOfStockLeft}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-primary">
                      {row.suggestedReorderQty}
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                      {row.analysisNote}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
