import { User, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { apiGetJsonAuthed, getStoredAccessToken } from "@/lib/api-client";
import {
  type PosCustomerSearchRow,
  useBillingStore,
} from "@/stores/billing-store";

const SEARCH_DEBOUNCE_MS = 280;

function formatRelativePast(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 56) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const moneyCompact = (s: string) => {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
};

export function PosCheckoutCustomerBlock() {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const posCustomerName = useBillingStore((s) => s.posCustomerName);
  const posCustomerPhone = useBillingStore((s) => s.posCustomerPhone);
  const posLinkedCustomerId = useBillingStore((s) => s.posLinkedCustomerId);
  const posCustomerSummary = useBillingStore((s) => s.posCustomerSummary);
  const setPosCustomerName = useBillingStore((s) => s.setPosCustomerName);
  const setPosCustomerPhone = useBillingStore((s) => s.setPosCustomerPhone);
  const linkPosCustomer = useBillingStore((s) => s.linkPosCustomer);
  const clearPosCustomer = useBillingStore((s) => s.clearPosCustomer);

  const [suggestions, setSuggestions] = useState<PosCustomerSearchRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const debouncedQ = useMemo(() => {
    const n = posCustomerName.trim();
    const p = posCustomerPhone.trim();
    return [n, p].filter(Boolean).join(" ").trim();
  }, [posCustomerName, posCustomerPhone]);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredAccessToken();
    if (!token || debouncedQ.length < 1) {
      setSuggestions([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const q = encodeURIComponent(debouncedQ);
          const data = await apiGetJsonAuthed<PosCustomerSearchRow[]>(
            `/api/v1/customers/pos-search?q=${q}&limit=12`,
          );
          if (!cancelled) {
            setSuggestions(data);
            setHighlight(0);
            setPanelOpen(data.length > 0);
          }
        } catch {
          if (!cancelled) {
            setSuggestions([]);
            setPanelOpen(false);
          }
        } finally {
          if (!cancelled) setSearchLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [debouncedQ]);

  const pickSuggestion = useCallback(
    (row: PosCustomerSearchRow) => {
      linkPosCustomer(row);
      setPanelOpen(false);
      setSuggestions([]);
    },
    [linkPosCustomer],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!panelOpen || suggestions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = suggestions[highlight];
        if (row) pickSuggestion(row);
      } else if (e.key === "Escape") {
        setPanelOpen(false);
      }
    },
    [highlight, panelOpen, pickSuggestion, suggestions],
  );

  useEffect(() => {
    if (!panelOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-suggest-index="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [panelOpen]);

  const showSummary = posLinkedCustomerId && posCustomerSummary;

  return (
    <div ref={rootRef} className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <User className="size-3.5" aria-hidden />
          Customer
        </div>
        {(posCustomerName.trim() ||
          posCustomerPhone.trim() ||
          posLinkedCustomerId) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-full px-2 text-xs text-muted-foreground"
            onClick={() => {
              clearPosCustomer();
              setSuggestions([]);
              setPanelOpen(false);
            }}
          >
            <X className="size-3.5" />
            Clear
          </Button>
        )}
      </div>
      <div className="relative">
        <div className="grid gap-2 sm:grid-cols-2" onKeyDown={onKeyDown}>
          <div className="space-y-1">
            <Label htmlFor="pos-cust-name" className="text-[11px] text-muted-foreground">
              Name
            </Label>
            <Input
              id="pos-cust-name"
              autoComplete="name"
              placeholder="Customer name"
              value={posCustomerName}
              onChange={(e) => {
                setPosCustomerName(e.target.value);
                if (e.target.value.trim().length > 0) setPanelOpen(true);
              }}
              onFocus={() => suggestions.length > 0 && setPanelOpen(true)}
              className="h-9 rounded-lg border-border/80 bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pos-cust-phone" className="text-[11px] text-muted-foreground">
              Phone
            </Label>
            <Input
              id="pos-cust-phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Mobile number"
              value={posCustomerPhone}
              onChange={(e) => {
                setPosCustomerPhone(e.target.value);
                if (e.target.value.trim().length > 0) setPanelOpen(true);
              }}
              onFocus={() => suggestions.length > 0 && setPanelOpen(true)}
              className="h-9 rounded-lg border-border/80 bg-background text-sm tabular-nums"
            />
          </div>
        </div>

        {panelOpen && suggestions.length > 0 ? (
          <div
            ref={listRef}
            role="listbox"
            aria-label="Matching customers"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[min(40vh,220px)] overflow-auto rounded-lg border border-border/80 bg-popover py-1 text-sm shadow-md"
          >
            {suggestions.map((row, i) => (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={i === highlight}
                data-suggest-index={i}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                  i === highlight ? "bg-accent" : "hover:bg-muted/80",
                )}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pickSuggestion(row)}
              >
                <span className="font-medium leading-tight">{row.fullName}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {row.phone ?? "—"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {row.orderCount} orders · {formatRelativePast(row.lastPurchaseAt) || "No prior sale"}
                  {" · "}
                  <span className="font-medium text-foreground">{moneyCompact(row.lifetimeSpend)}</span>{" "}
                  lifetime
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {searchLoading && debouncedQ.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">Searching…</p>
      ) : null}

      {showSummary ? (
        <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2.5 text-sm shadow-sm">
          <p className="font-medium leading-tight">{posCustomerName.trim()}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {posCustomerPhone.trim() || "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {posCustomerSummary.orderCount} orders · Last{" "}
            {formatRelativePast(posCustomerSummary.lastPurchaseAt) || "—"}
          </p>
          <p className="text-[11px] font-medium text-foreground">
            {moneyCompact(posCustomerSummary.lifetimeSpend)} total purchases
          </p>
        </div>
      ) : null}
    </div>
  );
}
