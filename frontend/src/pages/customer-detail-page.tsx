import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { OrderInvoiceSheet } from "@/components/customers/order-invoice-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchCustomer,
  fetchCustomerOrders,
  type CustomerDetail,
  type CustomerOrderSummary,
} from "@/lib/customers-api";
import { getStoredAccessToken } from "@/lib/api-client";

const fmtInr = (s: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(s) || 0);

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const authed = Boolean(getStoredAccessToken());
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [invoiceLabel, setInvoiceLabel] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const loadCustomer = useCallback(async () => {
    if (!id || !authed) return;
    setLoading(true);
    setErr(null);
    try {
      const row = await fetchCustomer(id);
      setCustomer(row);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Customer not found");
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [id, authed]);

  const loadOrders = useCallback(async () => {
    if (!id || !authed) return;
    setOrdersLoading(true);
    try {
      const out = await fetchCustomerOrders(id, { page, limit: 20 });
      setOrders(out.items);
      setMeta(out.meta);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setOrdersLoading(false);
    }
  }, [id, authed, page]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  function openInvoice(orderId: string, label: string | null) {
    setInvoiceOrderId(orderId);
    setInvoiceLabel(label);
    setInvoiceOpen(true);
  }

  if (!authed) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link to={`/login?redirect=/dashboard/customers/${id ?? ""}`} className="underline">
          Sign in
        </Link>{" "}
        to view this customer.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading customer…
      </div>
    );
  }

  if (err && !customer) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/customers">
            <ArrowLeft className="mr-1 size-4" />
            Back to customers
          </Link>
        </Button>
        <p className="text-sm text-destructive">{err}</p>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 h-8" asChild>
            <Link to="/dashboard/customers">
              <ArrowLeft className="mr-1 size-4" />
              Customers
            </Link>
          </Button>
          <h2 className="text-lg font-semibold tracking-tight">{customer.fullName}</h2>
          <p className="text-sm text-muted-foreground">
            {customer.phone ?? "No phone"}
            {customer.email ? ` · ${customer.email}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Orders</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {customer.stats.orderCount}
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lifetime spend</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {fmtInr(customer.stats.lifetimeSpend)}
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last purchase</CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-medium">
            {customer.stats.lastPurchaseAt
              ? formatDate(customer.stats.lastPurchaseAt)
              : "—"}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Purchase history</CardTitle>
          <CardDescription>
            Confirmed sales and credit notes linked to this customer. Click Invoice to view the full bill.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ordersLoading && orders.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading orders…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No purchases yet.
                    </TableCell>
                  </TableRow>
                ) : null}
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.invoiceNumber ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(o.confirmedAt ?? o.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {o.documentType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{o.lineCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {Number(o.discountTotal) > 0 ? `−${fmtInr(o.discountTotal)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fmtInr(o.grandTotal)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => openInvoice(o.id, o.invoiceNumber)}
                      >
                        <FileText className="size-3.5" />
                        Invoice
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {meta.page} of {Math.max(1, meta.totalPages)} ({meta.total} orders)
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <OrderInvoiceSheet
        orderId={invoiceOrderId}
        invoiceLabel={invoiceLabel}
        open={invoiceOpen}
        onOpenChange={(open) => {
          setInvoiceOpen(open);
          if (!open) {
            setInvoiceOrderId(null);
            setInvoiceLabel(null);
          }
        }}
      />
    </div>
  );
}
