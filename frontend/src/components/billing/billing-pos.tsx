import {
  Keyboard,
  Minus,
  Plus,
  Receipt,
  ScanBarcode,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InvoicePreviewSheet } from "@/components/billing/invoice-preview-sheet";
import { PosCartSummary } from "@/components/billing/pos-cart-summary";
import { PosCheckoutCustomerBlock } from "@/components/billing/pos-checkout-customer";
import { PosLineDiscount } from "@/components/billing/pos-line-discount";
import { useBillingQuote } from "@/hooks/use-billing-quote";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  apiGetJsonAuthed,
  apiPostJsonAuthed,
  getStoredAccessToken,
} from "@/lib/api-client";
import {
  buildPosCheckoutPayload,
  type PaymentMethod,
  useBillingStore,
} from "@/stores/billing-store";
import { useUiStore } from "@/stores/ui-store";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

type PosVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  listPrice: string | number;
  gstEnabled: boolean;
  gstPricingMode: "INCLUSIVE" | "EXCLUSIVE";
  cgstRate: string | number;
  sgstRate: string | number;
  igstRate: string | number;
  color: { name: string } | null;
  size: { label: string; code: string } | null;
  inventory: { quantity: number } | null;
};

type PosProduct = {
  id: string;
  name: string;
  kind: "APPAREL" | "ACCESSORY";
  variants: PosVariant[];
};

function variantLabel(v: PosVariant): string {
  return [v.color?.name, v.size?.label].filter(Boolean).join(" / ") || "Default";
}

function asMoneyNumber(v: string | number): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

export function BillingPos() {
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef("");
  const barcodeResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [catalog, setCatalog] = useState<PosProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [saleMessage, setSaleMessage] = useState<string | null>(null);

  const searchQuery = useBillingStore((s) => s.searchQuery);
  const setSearchQuery = useBillingStore((s) => s.setSearchQuery);
  const selectedProductId = useBillingStore((s) => s.selectedProductId);
  const setSelectedProduct = useBillingStore((s) => s.setSelectedProduct);
  const selectedVariantIndex = useBillingStore((s) => s.selectedVariantIndex);
  const setSelectedVariantIndex = useBillingStore((s) => s.setSelectedVariantIndex);
  const lines = useBillingStore((s) => s.lines);
  const gstEnabled = useBillingStore((s) => s.gstEnabled);
  const setGstEnabled = useBillingStore((s) => s.setGstEnabled);
  const payment = useBillingStore((s) => s.payment);
  const setPayment = useBillingStore((s) => s.setPayment);
  const addOrIncrementLine = useBillingStore((s) => s.addOrIncrementLine);
  const setQty = useBillingStore((s) => s.setQty);
  const removeLine = useBillingStore((s) => s.removeLine);
  const clearCart = useBillingStore((s) => s.clearCart);
  const posLinkedCustomerId = useBillingStore((s) => s.posLinkedCustomerId);
  const posCustomerName = useBillingStore((s) => s.posCustomerName);
  const posCustomerPhone = useBillingStore((s) => s.posCustomerPhone);
  const setInvoicePreviewOpen = useUiStore((s) => s.setInvoicePreviewOpen);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredAccessToken();
    if (!token) {
      setCatalog([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        setCatalogLoading(true);
        try {
          const search = encodeURIComponent(searchQuery.trim());
          const data = await apiGetJsonAuthed<PosProduct[]>(
            `/api/v1/billing/pos/search?limit=30${search ? `&search=${search}` : ""}`,
          );
          if (!cancelled) setCatalog(data);
        } finally {
          if (!cancelled) setCatalogLoading(false);
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const filtered = catalog;
  const selected = useMemo(
    () => filtered.find((p) => p.id === selectedProductId) ?? null,
    [filtered, selectedProductId],
  );
  const variant = selected?.variants[selectedVariantIndex];

  const addCurrentVariant = useCallback(() => {
    if (!selected || !variant) return;
    addOrIncrementLine({
      productId: selected.id,
      variantId: variant.id,
      name: selected.name,
      variantLabel: variantLabel(variant),
      sku: variant.sku,
      unitPrice: asMoneyNumber(variant.listPrice),
      availableStock: variant.inventory?.quantity ?? 0,
      gstPricingMode: variant.gstPricingMode,
      cgstRate: asMoneyNumber(variant.cgstRate),
      sgstRate: asMoneyNumber(variant.sgstRate),
      igstRate: asMoneyNumber(variant.igstRate),
    });
  }, [addOrIncrementLine, selected, variant]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable;

      if (e.key === "/" && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (e.key === "Enter" && document.activeElement === searchRef.current) {
        const exact = filtered.find((p) =>
          p.variants.some((v) => v.barcode === searchQuery || v.sku === searchQuery),
        );
        if (exact) {
          e.preventDefault();
          const exactVariant =
            exact.variants.find((v) => v.barcode === searchQuery || v.sku === searchQuery) ??
            exact.variants[0];
          setSelectedProduct(exact.id);
          setSelectedVariantIndex(Math.max(0, exact.variants.indexOf(exactVariant)));
          addOrIncrementLine({
            productId: exact.id,
            variantId: exactVariant.id,
            name: exact.name,
            variantLabel: variantLabel(exactVariant),
            sku: exactVariant.sku,
            unitPrice: asMoneyNumber(exactVariant.listPrice),
            availableStock: exactVariant.inventory?.quantity ?? 0,
            gstPricingMode: exactVariant.gstPricingMode,
            cgstRate: asMoneyNumber(exactVariant.cgstRate),
            sgstRate: asMoneyNumber(exactVariant.sgstRate),
            igstRate: asMoneyNumber(exactVariant.igstRate),
          });
          setSearchQuery("");
        } else if (filtered.length === 1) {
          e.preventDefault();
          const p = filtered[0];
          setSelectedProduct(p.id);
          const v = p.variants[selectedVariantIndex] ?? p.variants[0];
          addOrIncrementLine({
            productId: p.id,
            variantId: v.id,
            name: p.name,
            variantLabel: variantLabel(v),
            sku: v.sku,
            unitPrice: asMoneyNumber(v.listPrice),
            availableStock: v.inventory?.quantity ?? 0,
            gstPricingMode: v.gstPricingMode,
            cgstRate: asMoneyNumber(v.cgstRate),
            sgstRate: asMoneyNumber(v.sgstRate),
            igstRate: asMoneyNumber(v.igstRate),
          });
          setSearchQuery("");
        }
      }

      if (!inField && /^[\d]$/.test(e.key)) {
        barcodeRef.current += e.key;
        if (barcodeResetTimer.current) clearTimeout(barcodeResetTimer.current);
        barcodeResetTimer.current = setTimeout(() => {
          barcodeRef.current = "";
        }, 220);

        const byBarcode = filtered.find((p) =>
          p.variants.some((v) => v.barcode === barcodeRef.current),
        );
        if (byBarcode && barcodeRef.current.length >= 13) {
          const v =
            byBarcode.variants.find((row) => row.barcode === barcodeRef.current) ??
            byBarcode.variants[0];
          addOrIncrementLine({
            productId: byBarcode.id,
            variantId: v.id,
            name: byBarcode.name,
            variantLabel: variantLabel(v),
            sku: v.sku,
            unitPrice: asMoneyNumber(v.listPrice),
            availableStock: v.inventory?.quantity ?? 0,
            gstPricingMode: v.gstPricingMode,
            cgstRate: asMoneyNumber(v.cgstRate),
            sgstRate: asMoneyNumber(v.sgstRate),
            igstRate: asMoneyNumber(v.igstRate),
          });
          barcodeRef.current = "";
          if (barcodeResetTimer.current) clearTimeout(barcodeResetTimer.current);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    addOrIncrementLine,
    filtered,
    searchQuery,
    selectedVariantIndex,
    setSearchQuery,
    setSelectedProduct,
    setSelectedVariantIndex,
  ]);

  useEffect(
    () => () => {
      if (barcodeResetTimer.current) clearTimeout(barcodeResetTimer.current);
    },
    [],
  );

  const cartDiscountType = useBillingStore((s) => s.cartDiscountType);
  const cartDiscountValue = useBillingStore((s) => s.cartDiscountValue);
  const { quote, loading: quoteLoading, error: quoteError } = useBillingQuote();

  const grandTotal = quote?.totals.grandTotal ?? "0";

  async function completeSale() {
    if (lines.length === 0 || !quote) return;
    setSaleMessage(null);
    try {
      const checkoutBody = buildPosCheckoutPayload({
        lines,
        gstEnabled,
        cartDiscountType,
        cartDiscountValue,
        payment,
        grandTotal: quote.totals.grandTotal,
        posLinkedCustomerId,
        posCustomerName,
        posCustomerPhone,
      });
      await apiPostJsonAuthed("/api/v1/billing/checkout", checkoutBody);
      setSaleMessage("Sale completed. Stock reduced automatically.");
      clearCart();
    } catch (e) {
      setSaleMessage(e instanceof Error ? e.message : "Could not complete sale.");
    }
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Point of sale</h2>
          <p className="text-sm text-muted-foreground">
            Live stock checkout — each variant shows{" "}
            <span className="font-medium text-foreground">available</span> units from inventory logs.
            Completing a sale reduces stock and feeds reports automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
            onClick={() => setInvoicePreviewOpen(true)}
          >
            <Receipt className="size-4" />
            Preview
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={() => clearCart()}
          >
            Clear cart
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card className="border-border/60">
            <CardContent className="p-4">
              <Label htmlFor="pos-search" className="sr-only">
                Product search
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  id="pos-search"
                  placeholder="Name, SKU, or barcode…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="h-11 rounded-xl border-border/80 pl-10 pr-10 text-base shadow-sm"
                />
                <ScanBarcode
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/60 md:col-span-1">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                  <span className="text-sm font-medium">Catalog</span>
                  <Badge variant="secondary">
                    {catalogLoading ? "…" : filtered.length}
                  </Badge>
                </div>
                <ScrollArea className="h-[min(52vh,420px)]">
                  <ul className="divide-y divide-border/50 p-2">
                    {filtered.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedProduct(p.id)}
                          className={cn(
                            "flex w-full flex-col rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150",
                            selectedProductId === p.id
                              ? "bg-foreground/10"
                              : "hover:bg-muted/60",
                          )}
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {p.kind === "APPAREL" ? "Clothing" : "Accessory"} · {p.variants.length} variants
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Keyboard className="size-4 text-muted-foreground" />
                  Variants
                </div>
                {selected ? (
                  <>
                    <p className="text-sm text-muted-foreground">{selected.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.variants.map((v, i) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVariantIndex(i)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
                            selectedVariantIndex === i
                              ? "border-foreground bg-foreground text-background"
                              : "border-border/80 bg-muted/40 hover:bg-muted",
                          )}
                        >
                          {variantLabel(v)}
                          <span className="ml-1.5 tabular-nums text-muted-foreground">
                            {money(asMoneyNumber(v.listPrice))}
                          </span>
                          <span className="ml-1.5 font-medium tabular-nums text-foreground">
                            avail {v.inventory?.quantity ?? 0}
                          </span>
                        </button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      className="w-full rounded-xl"
                      disabled={!variant || (variant.inventory?.quantity ?? 0) <= 0}
                      onClick={addCurrentVariant}
                    >
                      {(variant?.inventory?.quantity ?? 0) <= 0 ? "Unavailable" : "Add to bill"}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a product from the list to choose size or colour.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="overflow-visible border-border/60 lg:sticky lg:top-0">
            <CardContent className="space-y-4 overflow-visible p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Current bill</span>
                <span className="text-xs text-muted-foreground">{lines.length} lines</span>
              </div>
              <ScrollArea className="h-[min(40vh,320px)] pr-2">
                {lines.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No lines yet — scan or search to add.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="w-[100px] text-right">Qty</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            <div className="text-sm font-medium leading-tight">{l.name}</div>
                            <div className="text-xs text-muted-foreground">{l.variantLabel}</div>
                            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                              {money(l.unitPrice)} each · avail {l.availableStock}
                            </div>
                            <PosLineDiscount line={l} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1 rounded-lg border border-border/80 p-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 rounded-md"
                                onClick={() => setQty(l.id, l.qty - 1)}
                              >
                                <Minus className="size-3.5" />
                              </Button>
                              <span className="min-w-[1.5rem] text-center text-sm tabular-nums">
                                {l.qty}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 rounded-md"
                                onClick={() => setQty(l.id, l.qty + 1)}
                              >
                                <Plus className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              aria-label="Remove line"
                              onClick={() => removeLine(l.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
              <PosCheckoutCustomerBlock />
              <Separator />
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="gst-toggle" className="text-xs text-muted-foreground">
                    GST
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    5% apparel · 18% accessories
                  </p>
                </div>
                <Switch
                  id="gst-toggle"
                  checked={gstEnabled}
                  onCheckedChange={setGstEnabled}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Payment
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["cash", "Cash"],
                      ["card", "Card"],
                      ["upi", "UPI"],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      size="sm"
                      variant={payment === id ? "default" : "outline"}
                      className="rounded-full px-4"
                      onClick={() => setPayment(id as PaymentMethod)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <Separator />
              <PosCartSummary quote={quote} loading={quoteLoading} error={quoteError} />
              <Button
                type="button"
                size="lg"
                className="w-full rounded-xl text-base font-semibold"
                disabled={lines.length === 0 || !quote || quoteLoading}
                onClick={() => void completeSale()}
              >
                Complete sale
              </Button>
              {saleMessage ? (
                <p className="text-xs text-muted-foreground">{saleMessage}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/80 bg-background/95 p-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-semibold tabular-nums">
              {money(Number(grandTotal) || 0)}
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="min-w-[140px] rounded-xl"
            disabled={lines.length === 0}
            onClick={() => setInvoicePreviewOpen(true)}
          >
            Preview
          </Button>
        </div>
      </div>

      <InvoicePreviewSheet />
    </div>
  );
}
