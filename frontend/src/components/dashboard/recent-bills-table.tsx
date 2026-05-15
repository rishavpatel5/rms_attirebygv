import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RecentBillRow } from "@/hooks/use-dashboard-overview";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export function RecentBillsTable({
  items,
  loading,
}: {
  items: RecentBillRow[];
  loading?: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Recent bills</CardTitle>
        <p className="text-sm text-muted-foreground">Point of sale stream (last 30 days)</p>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No confirmed sales yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">When</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs font-medium">{b.id}</TableCell>
                  <TableCell>{b.customer}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{b.time}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(b.total)}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={
                        b.status === "paid"
                          ? "secondary"
                          : b.status === "voided"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {b.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
