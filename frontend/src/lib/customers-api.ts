import {
  apiGetJsonAuthed,
  apiGetJsonAuthedWithMeta,
  type PaginationMeta,
} from "./api-client";

function qs(params: Record<string, string | number | undefined>): string {
  const e = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    e.set(k, String(v));
  }
  const s = e.toString();
  return s ? `?${s}` : "";
}

export type CustomerDetail = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  marketingOptIn: boolean;
  createdAt: string;
  updatedAt: string;
  stats: {
    orderCount: number;
    lifetimeSpend: string;
    lastPurchaseAt: string | null;
  };
};

export type CustomerOrderSummary = {
  id: string;
  invoiceNumber: string | null;
  documentType: string;
  status: string;
  grandTotal: string;
  discountTotal: string;
  gstEnabled: boolean;
  confirmedAt: string | null;
  createdAt: string;
  lineCount: number;
};

export function fetchCustomer(id: string): Promise<CustomerDetail> {
  return apiGetJsonAuthed<CustomerDetail>(`/api/v1/customers/${id}`);
}

export async function fetchCustomerOrders(
  customerId: string,
  args?: { page?: number; limit?: number },
): Promise<{ items: CustomerOrderSummary[]; meta: PaginationMeta }> {
  const { data, meta } = await apiGetJsonAuthedWithMeta<CustomerOrderSummary[]>(
    `/api/v1/customers/${customerId}/orders${qs({
      page: args?.page,
      limit: args?.limit,
    })}`,
  );
  return { items: data, meta: meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 } };
}
