import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RevenueChartPoint } from "@/hooks/use-dashboard-overview";

export function SalesAnalyticsChart({
  data,
  loading,
}: {
  data: RevenueChartPoint[];
  loading?: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Sales analytics</CardTitle>
        <p className="text-sm text-muted-foreground">Order volume by month</p>
      </CardHeader>
      <CardContent className="h-[240px] pt-0">
        {loading ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No orders in the last six months.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.15 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const o = payload[0].payload as RevenueChartPoint;
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
                      <p className="font-medium text-popover-foreground">{o.month}</p>
                      <p className="tabular-nums text-muted-foreground">{o.orders} orders</p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="orders"
                fill="hsl(var(--chart-2))"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
