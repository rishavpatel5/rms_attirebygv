import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createPurchaseReturn,
  listPurchaseReturns,
  listSuppliers,
  previewPurchaseReturn,
  searchSupplierStock,
  type PurchaseReturnListRow,
  type ReturnPreview,
  type SupplierRow,
  type VariantSearchRow,
} from "@/lib/purchase-returns-api";

const fmtInr = (n: number | string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(
    typeof n === "string" ? Number(n) : n,
  );

type Line = {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string;
  onHand: number;
  quantity: number;
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `pr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function PurchaseReturnsPage() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<VariantSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [preview, setPreview] = useState<ReturnPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [refund, setRefund] = useState("");
  const [settlement, setSettlement] = useState<"CASH" | "BANK" | "UPI">("CASH");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState<PurchaseReturnListRow[]>([]);
  const idempotencyKey = useRef(newKey());

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await listPurchaseReturns());
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void listSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
    void loadHistory();
  }, [loadHistory]);

  // Debounced item search — scoped to the selected supplier's received stock.
  useEffect(() => {
    if (!supplierId) {
      setResults([]);
      return;
    }
    if (!focused) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchSupplierStock(supplierId, term.trim()));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [term, supplierId, focused]);

  // Changing supplier resets the in-progress return (items differ per supplier).
  function onSupplierChange(id: string) {
    setSupplierId(id);
    setTerm("");
    setResults([]);
    setLines([]);
    setPreview(null);
    setRefund("");
  }

  // Any change to the lines invalidates a stale preview — you must re-preview before confirm.
  function invalidatePreview() {
    setPreview(null);
  }

  function addItem(v: VariantSearchRow) {
    if (v.onHand <= 0) {
      toast.error(`${v.sku} has no stock to return`);
      return;
    }
    if (lines.some((l) => l.variantId === v.id)) return;
    setLines((prev) => [
      ...prev,
      {
        variantId: v.id,
        sku: v.sku,
        productName: v.productName,
        variantLabel: v.variantLabel,
        onHand: v.onHand,
        quantity: 1,
      },
    ]);
    invalidatePreview();
    // Keep the results open so multiple variants of the same product can be added in a row.
    setResults((prev) => prev.filter((r) => r.id !== v.id));
  }

  function setQty(variantId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.variantId === variantId ? { ...l, quantity: Math.max(1, Math.min(qty, l.onHand)) } : l,
      ),
    );
    invalidatePreview();
  }

  function removeLine(variantId: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
    invalidatePreview();
  }

  async function runPreview(): Promise<ReturnPreview | null> {
    if (lines.length === 0) return null;
    setPreviewing(true);
    try {
      const p = await previewPurchaseReturn(lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));
      setPreview(p);
      if (!refund) setRefund(p.bookValue); // default actual refund to book value
      return p;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to preview");
      return null;
    } finally {
      setPreviewing(false);
    }
  }

  function resetForm() {
    setLines([]);
    setPreview(null);
    setRefund("");
    setNote("");
    setSettlement("CASH");
    idempotencyKey.current = newKey();
  }

  async function confirm() {
    if (!supplierId) {
      toast.error("Select the supplier you're returning to");
      return;
    }
    const p = preview ?? (await runPreview());
    if (!p) return;
    const refundNum = Number(refund);
    if (!Number.isFinite(refundNum) || refundNum < 0) {
      toast.error("Enter a valid refund amount");
      return;
    }
    setConfirming(true);
    try {
      const doc = await createPurchaseReturn({
        supplierId,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        refundAmount: refundNum,
        settlementMethod: settlement,
        note: note.trim() || null,
        idempotencyKey: idempotencyKey.current,
        expectedBookValue: Number(p.bookValue),
      });
      toast.success(
        `Return recorded — book ${fmtInr(doc.bookValue)}, refund ${fmtInr(doc.refundAmount)}` +
          (doc.outcome !== "NEUTRAL" ? `, ${doc.outcome.toLowerCase()} ${fmtInr(Math.abs(Number(doc.difference)))}` : ""),
      );
      resetForm();
      void loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to confirm return";
      // WAC moved since preview → refresh the preview so the user sees the new number.
      if (/changed/i.test(msg)) {
        toast.error("Stock cost changed — showing the updated book value. Review, then confirm again.");
        await runPreview();
      } else {
        toast.error(msg);
      }
    } finally {
      setConfirming(false);
    }
  }

  const bookValue = preview ? Number(preview.bookValue) : 0;
  const refundNum = Number(refund) || 0;
  const difference = refundNum - bookValue;
  const visibleResults = results.filter((r) => !lines.some((l) => l.variantId === r.id));

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Undo2 className="size-4 text-primary" />
            Return stock to supplier
          </CardTitle>
          <CardDescription>
            Removes the returned quantity from inventory at its book value (WAC), records the actual supplier
            refund, and credits that refund to cash in hand. Any gap is recorded as a purchase-return gain/loss.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Supplier + item search */}
          <div className="grid gap-3 sm:grid-cols-[240px_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
                value={supplierId}
                onChange={(e) => onSupplierChange(e.target.value)}
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Find items from this supplier (name, SKU, brand)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => window.setTimeout(() => setFocused(false), 150)}
                  disabled={!supplierId}
                  placeholder={supplierId ? "Search this supplier's stock…" : "Select a supplier first"}
                  className="h-10 rounded-lg pl-9"
                />
                {searching ? (
                  <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}
                {focused && supplierId && visibleResults.length === 0 && !searching ? (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-lg">
                    {results.length > 0
                      ? "All matching items already added."
                      : `No in-stock items from this supplier${term ? " match your search" : ""}.`}
                  </div>
                ) : null}
                {focused && visibleResults.length > 0 ? (
                  <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                    {visibleResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addItem(r)}
                      >
                        <span>
                          <span className="font-medium">{r.productName}</span>{" "}
                          <span className="text-muted-foreground">· {r.variantLabel}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{r.sku}</span>
                        </span>
                        <span className={`text-xs tabular-nums ${r.onHand <= 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                          stock {r.onHand}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Lines */}
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
              Search and add the items you're returning.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Return qty</TableHead>
                    <TableHead className="text-right">Unit WAC</TableHead>
                    <TableHead className="text-right">Book value</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => {
                    const pl = preview?.lines.find((p) => p.variantId === l.variantId);
                    return (
                      <TableRow key={l.variantId}>
                        <TableCell>
                          <div className="text-sm font-medium">{l.productName}</div>
                          <div className="text-xs text-muted-foreground">{l.variantLabel}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.onHand}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={1}
                            max={l.onHand}
                            value={l.quantity}
                            onChange={(e) => setQty(l.variantId, Number(e.target.value))}
                            className="ml-auto h-8 w-20 rounded-lg text-right tabular-nums"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {pl ? fmtInr(pl.unitWac) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {pl ? fmtInr(pl.lineBookValue) : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLine(l.variantId)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Preview + settlement */}
          {lines.length > 0 ? (
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Actual refund (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={refund}
                    onChange={(e) => setRefund(e.target.value)}
                    placeholder="0.00"
                    className="h-9 w-36 rounded-lg tabular-nums"
                    disabled={!preview}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Settlement</Label>
                  <select
                    className="flex h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm"
                    value={settlement}
                    onChange={(e) => setSettlement(e.target.value as "CASH" | "BANK" | "UPI")}
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank</option>
                    <option value="UPI">UPI</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Note</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional"
                    className="h-9 w-52 rounded-lg"
                  />
                </div>
              </div>

              <div className="text-right text-sm">
                <div className="text-muted-foreground">
                  Book value: <span className="font-medium text-foreground tabular-nums">{preview ? fmtInr(preview.bookValue) : "— preview first"}</span>
                </div>
                {preview ? (
                  <>
                    <div className="text-muted-foreground">
                      Refund: <span className="font-medium text-foreground tabular-nums">{fmtInr(refundNum)}</span>
                    </div>
                    <div>
                      Difference:{" "}
                      <span
                        className={`font-semibold tabular-nums ${
                          difference < 0 ? "text-rose-600" : difference > 0 ? "text-emerald-600" : ""
                        }`}
                      >
                        {difference === 0 ? fmtInr(0) : `${difference < 0 ? "−" : "+"}${fmtInr(Math.abs(difference))}`}
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {difference < 0 ? "(loss)" : difference > 0 ? "(gain)" : "(neutral)"}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Actions */}
          {lines.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={resetForm} disabled={confirming || previewing}>
                <RotateCcw className="mr-1.5 size-3.5" />
                Clear
              </Button>
              <Button variant="secondary" onClick={() => void runPreview()} disabled={previewing || confirming}>
                {previewing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                Preview book value
              </Button>
              <Button onClick={() => void confirm()} disabled={confirming || !preview || !supplierId}>
                {confirming ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Plus className="mr-1.5 size-3.5" />}
                Confirm return
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* History */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent returns</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No supplier returns yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Book</TableHead>
                    <TableHead className="text-right">Refund</TableHead>
                    <TableHead className="text-right">Gain / Loss</TableHead>
                    <TableHead>Settle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((r) => {
                    const diff = Number(r.difference);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {r.createdAt.slice(0, 10)}
                        </TableCell>
                        <TableCell className="text-sm">{r.supplier.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.lineCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInr(r.bookValue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInr(r.refundAmount)}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${diff < 0 ? "text-rose-600" : diff > 0 ? "text-emerald-600" : "text-muted-foreground"}`}
                        >
                          {diff === 0 ? "—" : `${diff < 0 ? "−" : "+"}${fmtInr(Math.abs(diff))}`}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.settlementMethod}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
