import { Percent, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PosQuote } from "@/lib/billing-quote-types";
import { useBillingStore } from "@/stores/billing-store";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

const num = (s: string | undefined) => Number(s ?? 0) || 0;

type Props = {
  quote: PosQuote | null;
  loading: boolean;
  error: string | null;
};

export function PosCartSummary({ quote, loading, error }: Props) {
  const cartDiscountType = useBillingStore((s) => s.cartDiscountType);
  const cartDiscountValue = useBillingStore((s) => s.cartDiscountValue);
  const setCartDiscount = useBillingStore((s) => s.setCartDiscount);
  const clearCartDiscount = useBillingStore((s) => s.clearCartDiscount);

  const cartMode: "percent" | "flat" =
    cartDiscountType === "FLAT_AMOUNT" ? "flat" : "percent";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Bill discount
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={cartMode === "percent" && cartDiscountValue === 5 ? "default" : "outline"}
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setCartDiscount("PERCENT", 5)}
          >
            5% bill
          </Button>
          <Button
            type="button"
            size="sm"
            variant={cartMode === "percent" && cartDiscountValue === 10 ? "default" : "outline"}
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setCartDiscount("PERCENT", 10)}
          >
            10% bill
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-2 text-xs"
            onClick={() => clearCartDiscount()}
          >
            Clear
          </Button>
        </div>
        <div className="mt-2 flex gap-2">
          <div className="flex rounded-lg border border-border/80 p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium",
                cartMode === "percent" ? "bg-foreground text-background" : "text-muted-foreground",
              )}
              onClick={() => setCartDiscount("PERCENT", cartDiscountValue ?? 0)}
            >
              <Percent className="inline size-3" />
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium",
                cartMode === "flat" ? "bg-foreground text-background" : "text-muted-foreground",
              )}
              onClick={() => setCartDiscount("FLAT_AMOUNT", cartDiscountValue ?? 0)}
            >
              <Tag className="inline size-3" /> ₹
            </button>
          </div>
          <Input
            type="number"
            min={0}
            step={cartMode === "percent" ? 1 : 50}
            max={cartMode === "percent" ? 100 : undefined}
            placeholder={cartMode === "percent" ? "% off bill" : "₹ off bill"}
            value={cartDiscountValue ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                clearCartDiscount();
                return;
              }
              const v = Number(raw);
              if (Number.isNaN(v)) return;
              setCartDiscount(cartMode === "percent" ? "PERCENT" : "FLAT_AMOUNT", v);
            }}
            className="h-8 flex-1 rounded-lg text-sm tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        {loading ? <p className="text-xs text-muted-foreground">Recalculating…</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {quote ? (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">List subtotal</span>
              <span className="tabular-nums">{money(num(quote.totals.grossSubtotal))}</span>
            </div>
            {num(quote.totals.itemDiscountTotal) > 0 ? (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Item discounts</span>
                <span className="tabular-nums">−{money(num(quote.totals.itemDiscountTotal))}</span>
              </div>
            ) : null}
            {num(quote.totals.cartDiscountAmount) > 0 ? (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Bill discount</span>
                <span className="tabular-nums">−{money(num(quote.totals.cartDiscountAmount))}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxable</span>
              <span className="tabular-nums">{money(num(quote.totals.taxableValue))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST</span>
              <span className="tabular-nums">
                {money(
                  num(quote.totals.cgstTotal) +
                    num(quote.totals.sgstTotal) +
                    num(quote.totals.igstTotal),
                )}
              </span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-2 text-base font-semibold">
              <span>Grand total</span>
              <span className="tabular-nums">{money(num(quote.totals.grandTotal))}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Add items to see totals.</p>
        )}
      </div>
    </div>
  );
}
