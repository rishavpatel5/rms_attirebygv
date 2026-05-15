import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomerInsightsData } from "@/hooks/use-dashboard-overview";

export function CustomerInsights({
  data,
  loading,
}: {
  data: CustomerInsightsData | null;
  loading?: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Customer insights</CardTitle>
        <p className="text-sm text-muted-foreground">Retention in the last 30 days</p>
      </CardHeader>
      <CardContent className="space-y-6 pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Sign in to load customer metrics.</p>
        ) : data.customersInPeriod === 0 ? (
          <p className="text-sm text-muted-foreground">No customer purchases in this period.</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                New vs returning
              </p>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-chart-3 transition-all duration-500"
                  style={{ width: `${data.newPct}%` }}
                />
                <div
                  className="bg-chart-1 transition-all duration-500"
                  style={{ width: `${data.returningPct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>New {data.newPct}%</span>
                <span>Returning {data.returningPct}%</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  New customers
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{data.newCustomers}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Returning
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{data.returningCustomers}</p>
              </div>
            </div>
            <div className="flex items-baseline justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Repeat rate
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                  {data.repeatRatePct.toFixed(1)}%
                </p>
              </div>
              <p className="max-w-[140px] text-right text-xs text-muted-foreground">
                Customers with 2+ orders in range
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{data.note}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
