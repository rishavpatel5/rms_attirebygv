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
};

export function ShareInvoiceWhatsAppButton({
  phone,
  customerName,
  orderId,
  invoiceNumber,
  amountPaid,
  documentType,
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

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 gap-1 border-emerald-500/40 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
    >
      <MessageCircle className="size-3.5" />
      WhatsApp
    </Button>
  );
}
