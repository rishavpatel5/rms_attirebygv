import { useEffect, useMemo, useState } from "react";
import type { PosQuote } from "@/lib/billing-quote-types";
import { apiPostJsonAuthed, getStoredAccessToken } from "@/lib/api-client";
import {
  buildPosQuotePayload,
  useBillingStore,
} from "@/stores/billing-store";

const DEBOUNCE_MS = 220;

export function useBillingQuote() {
  const lines = useBillingStore((s) => s.lines);
  const gstEnabled = useBillingStore((s) => s.gstEnabled);
  const cartDiscountType = useBillingStore((s) => s.cartDiscountType);
  const cartDiscountValue = useBillingStore((s) => s.cartDiscountValue);

  const [quote, setQuote] = useState<PosQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payloadKey = useMemo(
    () =>
      JSON.stringify(
        buildPosQuotePayload({
          lines,
          gstEnabled,
          cartDiscountType,
          cartDiscountValue,
        }),
      ),
    [lines, gstEnabled, cartDiscountType, cartDiscountValue],
  );

  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!getStoredAccessToken()) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const body = buildPosQuotePayload({
            lines,
            gstEnabled,
            cartDiscountType,
            cartDiscountValue,
          });
          const data = await apiPostJsonAuthed<PosQuote>("/api/v1/billing/quote", body);
          if (!cancelled) {
            setQuote(data);
            setError(null);
          }
        } catch (e) {
          if (!cancelled) {
            setQuote(null);
            setError(e instanceof Error ? e.message : "Could not calculate totals");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [payloadKey, lines, gstEnabled, cartDiscountType, cartDiscountValue]);

  return { quote, loading, error };
}
