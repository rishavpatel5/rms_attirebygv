import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  apiDeleteAuthed,
  apiGetJsonAuthed,
  apiPostJsonAuthed,
} from "@/lib/api-client";

type BusinessPosition = {
  capitalIntroduced: number;
  ownerDrawings: number;
  salesCollected: number;
  stockCashOut: number;
  operatingExpenses: number;
  inventoryValue: number;
  supplierRefunds: number;
  purchaseReturnGainLoss: number;
  netProfit: number;
  cashInHand: number;
  hasCapital: boolean;
};

type CapitalEntry = {
  id: string;
  type: "INVESTMENT" | "DRAWING";
  amount: string;
  date: string;
  note: string | null;
};

const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const fmtSigned = (n: number) => `${n < 0 ? "−" : "+"}${fmtInr(Math.abs(n))}`;

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BusinessPosition() {
  const [position, setPosition] = useState<BusinessPosition | null>(null);
  const [entries, setEntries] = useState<CapitalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Setup form (seed opening capital from cash in hand)
  const [openingCash, setOpeningCash] = useState("");
  const [seeding, setSeeding] = useState(false);

  // Add-entry form
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState<"INVESTMENT" | "DRAWING">("INVESTMENT");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryDate, setEntryDate] = useState(todayYmd());
  const [entryNote, setEntryNote] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pos, list] = await Promise.all([
        apiGetJsonAuthed<BusinessPosition>("/api/v1/capital/position"),
        apiGetJsonAuthed<CapitalEntry[]>("/api/v1/capital?limit=100"),
      ]);
      setPosition(pos);
      setEntries(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load business position");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSeed() {
    const cash = Number(openingCash);
    if (!Number.isFinite(cash) || cash < 0) {
      toast.error("Enter a valid cash amount.");
      return;
    }
    setSeeding(true);
    try {
      await apiPostJsonAuthed("/api/v1/capital/opening-cash", { cashInHand: cash });
      toast.success("Opening capital set — cash in hand now reconciles.");
      setOpeningCash("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set opening capital");
    } finally {
      setSeeding(false);
    }
  }

  async function handleAddEntry() {
    const amt = Number(entryAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be a positive number.");
      return;
    }
    setSavingEntry(true);
    try {
      await apiPostJsonAuthed("/api/v1/capital", {
        type: entryType,
        amount: amt,
        date: entryDate,
        note: entryNote.trim() || null,
      });
      toast.success(entryType === "INVESTMENT" ? "Capital added" : "Drawing recorded");
      setShowForm(false);
      setEntryAmount("");
      setEntryNote("");
      setEntryType("INVESTMENT");
      setEntryDate(todayYmd());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save entry");
    } finally {
      setSavingEntry(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiDeleteAuthed(`/api/v1/capital/${id}`);
      toast.success("Entry deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete entry");
    }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" />
          <CardTitle className="text-base">Business Position</CardTitle>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            As of today
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !position ? null : !position.hasCapital ? (
          // ── First-time setup ──
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-5">
            <p className="text-sm font-semibold">Set up cash tracking</p>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Enter the cash your business has on hand <strong>right now</strong>. We'll back-calculate the
              capital invested (from your stock, expenses and sales) so cash in hand reconciles to the rupee.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cash in hand (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="e.g. 17186"
                  className="h-10 w-44 rounded-xl tabular-nums"
                />
              </div>
              <Button className="h-10 rounded-xl" disabled={seeding} onClick={() => void handleSeed()}>
                {seeding ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Set opening capital
              </Button>
            </div>
          </div>
        ) : (
          // ── Cash in hand + breakdown ──
          <div className="space-y-5">
            <div className="rounded-xl border border-border/60 bg-gradient-to-br from-emerald-50/60 to-transparent p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cash in hand
              </p>
              <p
                className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${
                  position.cashInHand < 0 ? "text-destructive" : ""
                }`}
              >
                {fmtInr(position.cashInHand)}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                + {fmtInr(position.inventoryValue)} tied up in stock · {fmtInr(position.netProfit)} earned to
                date
              </p>
            </div>

            <div className="rounded-lg border border-border/60">
              <BreakdownRow label="Capital introduced" value={position.capitalIntroduced} />
              <BreakdownRow label="Sales collected" value={position.salesCollected} />
              <BreakdownRow label="Stock purchased (paid)" value={-position.stockCashOut} />
              <BreakdownRow label="Operating expenses" value={-position.operatingExpenses} />
              <BreakdownRow label="Owner drawings" value={-position.ownerDrawings} />
              {position.supplierRefunds !== 0 ? (
                <BreakdownRow label="Supplier refunds" value={position.supplierRefunds} />
              ) : null}
              <div className="flex items-center justify-between px-4 py-2.5 font-semibold">
                <span className="text-sm">= Cash in hand</span>
                <span className="tabular-nums">{fmtInr(position.cashInHand)}</span>
              </div>
            </div>

            {position.purchaseReturnGainLoss !== 0 ? (
              <p className="-mt-2 px-1 text-xs text-muted-foreground">
                Purchase-return {position.purchaseReturnGainLoss < 0 ? "loss" : "gain"}:{" "}
                <span className={position.purchaseReturnGainLoss < 0 ? "text-rose-600" : "text-emerald-600"}>
                  {fmtSigned(position.purchaseReturnGainLoss)}
                </span>{" "}
                (included in net profit)
              </p>
            ) : null}

            {/* ── Capital & Drawings ledger ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Capital &amp; drawings</p>
                <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
                  <Plus className="mr-1.5 size-3.5" />
                  Add entry
                </Button>
              </div>

              {showForm ? (
                <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[140px_1fr_150px_auto]">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <select
                      className="flex h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-2 text-sm"
                      value={entryType}
                      onChange={(e) => setEntryType(e.target.value as "INVESTMENT" | "DRAWING")}
                    >
                      <option value="INVESTMENT">Money in (capital)</option>
                      <option value="DRAWING">Money out (drawing)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={entryAmount}
                      onChange={(e) => setEntryAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-9 rounded-lg tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date</Label>
                    <Input
                      type="date"
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      className="h-9 rounded-lg"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button className="h-9 rounded-lg" disabled={savingEntry} onClick={() => void handleAddEntry()}>
                      {savingEntry ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                  <div className="space-y-1.5 sm:col-span-4">
                    <Input
                      value={entryNote}
                      onChange={(e) => setEntryNote(e.target.value)}
                      placeholder="Note (optional) — e.g. owner top-up, personal withdrawal"
                      className="h-9 rounded-lg"
                    />
                  </div>
                </div>
              ) : null}

              {entries.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No capital or drawing entries yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {e.date.slice(0, 10)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                                e.type === "INVESTMENT"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {e.type === "INVESTMENT" ? "Capital in" : "Drawing"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {fmtInr(Number(e.amount))}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                            {e.note ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => void handleDelete(e.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 px-4 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${value < 0 ? "text-rose-600" : "text-emerald-600"}`}>
        {fmtSigned(value)}
      </span>
    </div>
  );
}
