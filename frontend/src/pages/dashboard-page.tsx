import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { InventoryAlerts } from "@/components/dashboard/inventory-alerts";
import { TopProductsTable } from "@/components/dashboard/top-products-table";
import { RecentBillsTable } from "@/components/dashboard/recent-bills-table";
import { SalesAnalyticsChart } from "@/components/dashboard/sales-analytics-chart";
import { CustomerInsights } from "@/components/dashboard/customer-insights";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGetJson } from "@/lib/api-client";
import { useDashboardOverview } from "@/hooks/use-dashboard-overview";

type HealthPayload = {
  status: string;
  database: string;
};

export function DashboardPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const overview = useDashboardOverview();

  useEffect(() => {
    let cancelled = false;
    void apiGetJson<HealthPayload>("/api/v1/health")
      .then((data) => {
        if (!cancelled) {
          setHealth(data);
          setHealthError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setHealth(null);
          setHealthError(e instanceof Error ? e.message : "Unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = overview.loading;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Today at a glance</h2>
        <p className="text-sm text-muted-foreground">
          Operational snapshot — sales, stock, and customers stay aligned with the same transaction
          ledger.
        </p>
      </div>

      {overview.needsAuth ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Sign in to load live KPIs and charts from your store data.
          </CardContent>
        </Card>
      ) : null}

      {overview.error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{overview.error}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void overview.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60 bg-muted/20 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Retail workflow</p>
            <p className="max-w-xl text-xs text-muted-foreground">
              Master blueprint → receive stock → watch live inventory → bill at POS → read reports.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary" className="rounded-full">
              <Link to="/dashboard/catalog">Master catalog</Link>
            </Button>
            <Button asChild size="sm" variant="secondary" className="rounded-full">
              <Link to="/dashboard/purchases">Receive stock</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/billing">Open POS</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && overview.kpis.length === 0
          ? Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="border-border/60">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">Loading…</p>
                </CardContent>
              </Card>
            ))
          : overview.kpis.map((k) => <KpiCard key={k.id} {...k} />)}
      </div>

      <section className="space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <RevenueChart data={overview.revenueSeries} loading={loading} />
            <SalesAnalyticsChart data={overview.revenueSeries} loading={loading} />
            <TopProductsTable items={overview.topProducts} loading={loading} />
          </div>
          <div className="flex w-full flex-col gap-6 lg:w-[340px] lg:shrink-0">
            <CustomerInsights data={overview.customerInsights} loading={loading} />
            <InventoryAlerts items={overview.inventoryAlerts} loading={loading} />
          </div>
        </div>
        <RecentBillsTable items={overview.recentBills} loading={loading} />
      </section>

      <Card className="border-dashed border-border/80 bg-muted/15">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">API status</p>
            <p className="text-xs text-muted-foreground">GET /api/v1/health</p>
          </div>
          <div className="text-sm">
            {healthError ? (
              <span className="text-destructive">{healthError}</span>
            ) : health ? (
              <code className="rounded-md bg-muted px-2 py-1 text-xs">
                {health.status} · {health.database}
              </code>
            ) : (
              <span className="text-muted-foreground">Checking…</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
