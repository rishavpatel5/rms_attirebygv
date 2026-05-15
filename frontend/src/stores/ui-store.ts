import { create } from "zustand";

type UiState = {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  invoicePreviewOpen: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setInvoicePreviewOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  invoicePreviewOpen: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebarCollapsed: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setInvoicePreviewOpen: (invoicePreviewOpen) => set({ invoicePreviewOpen }),
}));
