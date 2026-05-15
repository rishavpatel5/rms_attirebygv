import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RevenueChartPoint } from "@/hooks/use-dashboard-overview";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export function RevenueChart({
  data,
  loading,
}: {
  data: RevenueChartPoint[];
  loading?: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Revenue</CardTitle>
        <p className="text-sm text-muted-foreground">Trailing six months — net of returns</p>
      </CardHeader>
      <CardContent className="h-[280px] pt-0">
        {loading ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No sales in the last six months.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <YAxis
                tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                tickLine={false}
                axisLine={false}
                width={40}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const row = payload[0].payload as RevenueChartPoint;
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
                      <p className="font-medium text-popover-foreground">{row.month}</p>
                      <p className="tabular-nums text-muted-foreground">{fmt(row.revenue)}</p>
                      <p className="text-xs text-muted-foreground">{row.orders} orders</p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                fill="url(#fillRev)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
