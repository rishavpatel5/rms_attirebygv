import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { BillingPage } from "@/pages/billing-page";
import { CatalogPage } from "@/pages/catalog-page";
import { CustomerDetailPage } from "@/pages/customer-detail-page";
import { CustomersPage } from "@/pages/customers-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { InventoryPage } from "@/pages/inventory-page";
import { LoginPage } from "@/pages/login-page";
import { PublicInvoicePage } from "@/pages/public-invoice-page";
import { OffersPage } from "@/pages/offers-page";
import { PurchasesPage } from "@/pages/purchases-page";
import { ReportsPage } from "@/pages/reports-page";
import { SettingsPage } from "@/pages/settings-page";
import { SuppliersPage } from "@/pages/suppliers-page";

const router = createBrowserRouter([
  { path: "/i/:orderId", element: <PublicInvoicePage /> },
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <DashboardShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "dashboard/catalog", element: <CatalogPage /> },
      { path: "dashboard/purchases", element: <PurchasesPage /> },
      { path: "dashboard/inventory", element: <InventoryPage /> },
      { path: "dashboard/customers", element: <CustomersPage /> },
      { path: "dashboard/customers/:id", element: <CustomerDetailPage /> },
      { path: "dashboard/suppliers", element: <SuppliersPage /> },
      { path: "dashboard/reports", element: <ReportsPage /> },
      { path: "dashboard/offers", element: <OffersPage /> },
      { path: "dashboard/settings", element: <SettingsPage /> },
      { path: "billing", element: <BillingPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}