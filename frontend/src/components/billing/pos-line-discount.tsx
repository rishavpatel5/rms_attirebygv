import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BillingLine, RetailDiscountType } from "@/stores/billing-store";
import { useBillingStore } from "@/stores/billing-store";

type Props = {
  line: BillingLine;
};

export function PosLineDiscount({ line }: Props) {
  const setLineItemDiscount = useBillingStore((s) => s.setLineItemDiscount);
  const clearLineItemDiscount = useBillingStore((s) => s.clearLineItemDiscount);

  const mode: "percent" | "flat" =
    line.itemDiscountType === "FLAT_AMOUNT" ? "flat" : "percent";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-medium",
          line.itemDiscountType === "PERCENT" && line.itemDiscountValue === 5
            ? "border-foreground bg-foreground text-background"
            : "border-border/80 text-muted-foreground hover:bg-muted/60",
        )}
        onClick={() => setLineItemDiscount(line.id, "PERCENT", 5)}
      >
        5%
      </button>
      <button
        type="button"
        className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-medium",
          line.itemDiscountType === "PERCENT" && line.itemDiscountValue === 10
            ? "border-foreground bg-foreground text-background"
            : "border-border/80 text-muted-foreground hover:bg-muted/60",
        )}
        onClick={() => setLineItemDiscount(line.id, "PERCENT", 10)}
      >
        10%
      </button>
      <div className="flex items-center gap-1 rounded-lg border border-border/70 px-1">
        <select
          className="h-7 max-w-[4.5rem] border-0 bg-transparent text-[10px] outline-none"
          value={mode}
          onChange={(e) => {
            const t = e.target.value as "percent" | "flat";
            const type: RetailDiscountType = t === "flat" ? "FLAT_AMOUNT" : "PERCENT";
            setLineItemDiscount(line.id, type, line.itemDiscountValue ?? 0);
          }}
        >
          <option value="percent">%</option>
          <option value="flat">₹</option>
        </select>
        <Input
          type="number"
          min={0}
          step={mode === "percent" ? 1 : 10}
          max={mode === "percent" ? 100 : undefined}
          placeholder="0"
          value={line.itemDiscountValue ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              clearLineItemDiscount(line.id);
              return;
            }
            const v = Number(raw);
            if (Number.isNaN(v)) return;
            setLineItemDiscount(
              line.id,
              mode === "percent" ? "PERCENT" : "FLAT_AMOUNT",
              v,
            );
          }}
          className="h-7 w-14 border-0 bg-transparent p-0 text-right text-xs tabular-nums shadow-none focus-visible:ring-0"
        />
      </div>
      {(line.itemDiscountType || line.itemDiscountValue) && (
        <button
          type="button"
          className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => clearLineItemDiscount(line.id)}
        >
          Clear
        </button>
      )}
    </div>
  );
}
