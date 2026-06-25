import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { STORE_NAME } from "@/lib/brand";
import { useUiStore } from "@/stores/ui-store";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/catalog": "Master Catalog",
  "/dashboard/purchases": "Purchases",
  "/dashboard/inventory": "Stocks",
  "/dashboard/customers": "Customers",
  "/dashboard/suppliers": "Suppliers",
  "/dashboard/purchase-analysis": "Purchase Analysis",
  "/dashboard/reports": "Reports & Analytics",
  "/dashboard/offers": "Offers & Marketing",
  "/dashboard/expenses": "Expenses",
  "/dashboard/bulk-import": "Bulk Import",
  "/dashboard/settings": "Settings",
  "/billing": "Billing / POS",
};

function titleFromPath(pathname: string) {
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/billing")) return "Billing / POS";
  if (pathname.startsWith("/dashboard/catalog")) return "Master Catalog";
  if (pathname.startsWith("/dashboard/purchases")) return "Purchases";
  if (pathname.startsWith("/dashboard/inventory")) return "Stocks";
  if (/^\/dashboard\/customers\/[^/]+$/.test(pathname)) return "Customer profile";
  if (pathname.startsWith("/dashboard/customers")) return "Customers";
  if (pathname.startsWith("/dashboard/suppliers")) return "Suppliers";
  if (pathname.startsWith("/dashboard/purchase-analysis")) return "Purchase Analysis";
  if (pathname.startsWith("/dashboard/reports")) return "Reports & Analytics";
  if (pathname.startsWith("/dashboard/offers")) return "Offers & Marketing";
  if (pathname.startsWith("/dashboard/expenses")) return "Expenses";
  if (pathname.startsWith("/dashboard/settings")) return "Settings";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  return STORE_NAME;
}
export function DashboardShell() {
  const location = useLocation();
  const title = titleFromPath(location.pathname);
  const isLg = useMediaQuery("(min-width: 1024px)");
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background bg-[radial-gradient(ellipse_80%_50%_at_100%_0%,hsl(var(--primary)/0.04),transparent)]">
      {isLg ? <AppSidebar className="hidden shrink-0 lg:flex" /> : null}
      {!isLg ? (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <AppSidebar className="h-full border-0 bg-transparent" />
          </SheetContent>
        </Sheet>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar title={title} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 overflow-y-auto px-4 py-6 animate-fade-in sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
