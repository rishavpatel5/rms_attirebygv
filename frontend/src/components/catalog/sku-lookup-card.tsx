import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { useState } from "react";
import { ColorLabel } from "@/components/catalog/color-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGetJsonAuthed } from "@/lib/api-client";
import { kindLabel } from "@/lib/product-kind";

type SkuLookupVariant = {
  id: string;
  sku: string;
  isActive: boolean;
  listPrice: string | number;
  product: {
    id: string;
    name: string;
    kind: "APPAREL" | "ACCESSORY";
    brand: string | null;
    category: { name: string };
  };
  color: { name: string } | null;
  size: { label: string } | null;
  inventory: { quantity: number } | null;
};

type SkuLookupResponse = {
  query: string;
  exists: boolean;
  exactMatch: SkuLookupVariant | null;
  partialMatches: SkuLookupVariant[];
};

function variantLabel(v: SkuLookupVariant): string {
  return [v.color?.name, v.size?.label].filter(Boolean).join(" / ") || "—";
}

function LookupResultRow({ row }: { row: SkuLookupVariant }) {
  const stock = row.inventory?.quantity ?? 0;
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="font-medium leading-snug">{row.product.name}</p>
          <p className="font-mono text-sm">
            <ColorLabel colorName={row.color?.name}>{row.sku}</ColorLabel>
          </p>
          <p className="text-xs text-muted-foreground">
            {kindLabel(row.product.kind)} · {row.product.category.name}
            {row.product.brand ? ` · ${row.product.brand}` : ""} · {variantLabel(row)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px] uppercase">
            In catalog
          </Badge>
          {!row.isActive ? (
            <Badge variant="outline" className="text-[10px]">
              Inactive
            </Badge>
          ) : null}
          <Badge variant={stock > 0 ? "default" : "outline"} className="tabular-nums text-[10px]">
            {stock > 0 ? `${stock} in stock` : "No stock yet"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export function SkuLookupCard() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SkuLookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runLookup = async () => {
    const sku = query.trim();
    if (sku.length < 2) {
      setErr("Enter at least 2 characters of the SKU.");
      setResult(null);
      return;
    }
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const data = await apiGetJsonAuthed<SkuLookupResponse>(
        `/api/v1/catalog/variants/lookup?sku=${encodeURIComponent(sku)}`,
      );
      setResult(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">SKU lookup</CardTitle>
        <CardDescription>
          Check whether a SKU already exists in the master catalog before creating a new blueprint.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="sku-lookup">SKU</Label>
            <Input
              id="sku-lookup"
              placeholder="e.g. AT-M-ACE-BLK-M"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runLookup();
              }}
              className="font-mono"
            />
          </div>
          <Button type="button" className="gap-2" disabled={loading} onClick={() => void runLookup()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Check SKU
          </Button>
        </div>

        {err ? <p className="text-sm text-destructive">{err}</p> : null}

        {result && !loading ? (
          <div className="space-y-3">
            {result.exists && result.exactMatch ? (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-medium text-emerald-800 dark:text-emerald-300">
                    This SKU is already in the master catalog.
                  </p>
                  <LookupResultRow row={result.exactMatch} />
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
                <XCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    No exact match for <span className="font-mono">{result.query}</span>.
                  </p>
                  <p className="text-muted-foreground">
                    This SKU is not in the catalog yet — use <strong className="text-foreground">New blueprint</strong>{" "}
                    to create it.
                  </p>
                </div>
              </div>
            )}

            {!result.exists && result.partialMatches.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Similar SKUs
                </p>
                {result.partialMatches.map((row) => (
                  <LookupResultRow key={row.id} row={row} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
