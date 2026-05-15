import { Download, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  fetchOrderInvoicePdf,
  triggerPdfDownload,
} from "@/lib/billing-api";

type Props = {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown in download filename hint */
  invoiceLabel?: string | null;
};

export function OrderInvoiceSheet({
  orderId,
  open,
  onOpenChange,
  invoiceLabel,
}: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!open || !orderId) {
      setPdfUrl(null);
      setPdfBlob(null);
      setErr(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setErr(null);
    setPdfUrl(null);
    setPdfBlob(null);

    void fetchOrderInvoicePdf(orderId, { disposition: "inline" })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfBlob(blob);
        setPdfUrl(objectUrl);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load invoice PDF");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, orderId]);

  useEffect(() => {
    if (!open && pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setPdfBlob(null);
    }
  }, [open, pdfUrl]);

  async function handleDownload() {
    if (!orderId) return;
    try {
      const blob = pdfBlob ?? (await fetchOrderInvoicePdf(orderId, { disposition: "attachment" }));
      const name = invoiceLabel
        ? `${invoiceLabel.replace(/[^\w-]+/g, "_")}.pdf`
        : `invoice-${orderId.slice(0, 8)}.pdf`;
      triggerPdfDownload(blob, name);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Download failed");
    }
  }

  function openInNewTab() {
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-full w-full flex-col p-0 sm:max-w-2xl">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle>
            {invoiceLabel ? `Invoice ${invoiceLabel}` : "Invoice"}
          </SheetTitle>
          <p className="text-left text-sm text-muted-foreground">
            Generated from stored sale data — matches order ledger totals.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!pdfUrl || loading}
              onClick={() => void handleDownload()}
            >
              <Download className="mr-1 size-3.5" />
              Download PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!pdfUrl || loading}
              onClick={openInNewTab}
            >
              <ExternalLink className="mr-1 size-3.5" />
              Open in tab
            </Button>
          </div>
        </SheetHeader>

        <div className="relative min-h-0 flex-1 bg-muted/20">
          {loading ? (
            <div className="flex h-full min-h-[320px] items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Generating invoice…
            </div>
          ) : null}

          {err ? (
            <p className="p-6 text-sm text-destructive">{err}</p>
          ) : null}

          {pdfUrl && !loading ? (
            <iframe
              title="Invoice preview"
              src={pdfUrl}
              className="h-full min-h-[calc(100dvh-10rem)] w-full border-0 bg-white"
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
