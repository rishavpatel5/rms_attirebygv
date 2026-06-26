import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildInvoiceWhatsAppHref } from "@/lib/whatsapp-invoice";

type Props = {
  phone: string | null | undefined;
  customerName: string;
  orderId: string;
  invoiceNumber: string | null;
  amountPaid: string;
  documentType: string;
  /** Icon-only square button for tight rows (e.g. the order ledger). */
  compact?: boolean;
};

export function ShareInvoiceWhatsAppButton({
  phone,
  customerName,
  orderId,
  invoiceNumber,
  amountPaid,
  documentType,
  compact = false,
}: Props) {
  if (documentType !== "SALE" || !invoiceNumber) return null;

  const href = buildInvoiceWhatsAppHref({
    phone,
    customerName,
    orderId,
    invoiceNumber,
    amountPaid,
  });
  if (!href) return null;

  const emerald =
    "border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40";

  if (compact) {
    return (
      <Button
        type="button"
        size="icon"
        variant="outline"
        title="Send invoice on WhatsApp"
        aria-label="Send invoice on WhatsApp"
        className={`size-8 ${emerald}`}
        onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
      >
        <MessageCircle className="size-3.5" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={`h-8 gap-1 text-xs ${emerald}`}
      onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
    >
      <MessageCircle className="size-3.5" />
      WhatsApp
    </Button>
  );
}
