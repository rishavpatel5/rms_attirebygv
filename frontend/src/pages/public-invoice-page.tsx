import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { STORE_LOGO_ALT, STORE_LOGO_PATH } from "@/lib/brand";

/** PDF is always served by the API at GET /i/:orderId */
function invoiceApiBase(): string | null {
  const api = import.meta.env.VITE_API_URL as string | undefined;
  if (!api?.trim()) return null;
  return api.trim().replace(/\/$/, "");
}

/** WhatsApp links may use the frontend host (/i/:id); redirect to the API PDF route. */
export function PublicInvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();

  useEffect(() => {
    if (!orderId) return;
    const api = invoiceApiBase();
    if (!api) return;
    window.location.replace(`${api}/i/${encodeURIComponent(orderId)}`);
  }, [orderId]);

  const api = invoiceApiBase();

  if (!orderId || !api) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted-foreground">
        <img src={STORE_LOGO_PATH} alt={STORE_LOGO_ALT} className="h-16 max-w-56 object-contain" />
        Invoice link is not configured. Please contact the store.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <img src={STORE_LOGO_PATH} alt={STORE_LOGO_ALT} className="h-16 max-w-56 object-contain" />
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Opening your invoice…</p>
    </div>
  );
}
