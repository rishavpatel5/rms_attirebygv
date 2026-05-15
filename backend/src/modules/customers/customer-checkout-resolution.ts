import { AppError } from "../../middleware/error-handler.js";
import type { Tx } from "../inventory/inventory.service.js";

/** Digits-first India-friendly normalization for unique phone keys (10 digits). */
export function normalizePhoneForStorage(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 0) return null;
  let d = digits;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length < 10) return null;
  if (d.length > 10) d = d.slice(-10);
  return d;
}

export type CustomerSnapshotInput = {
  fullName?: string | null;
  phone?: string | null;
};

/**
 * Resolves POS checkout customer linkage: explicit id, snapshot upsert (phone is unique key),
 * or walk-in. Intended for billing, loyalty, WhatsApp, and analytics pipelines that read `orders.customer_id`.
 */
export async function resolveCustomerForPosCheckout(
  tx: Tx,
  input: {
    customerId?: string | null;
    customerSnapshot?: CustomerSnapshotInput | null;
  },
): Promise<{ customerId: string | null; isWalkIn: boolean }> {
  if (input.customerId) {
    const c = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!c) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
    return { customerId: c.id, isWalkIn: false };
  }

  const snap = input.customerSnapshot;
  if (!snap) {
    return { customerId: null, isWalkIn: true };
  }

  const nameTrim = (snap.fullName ?? "").trim();
  const phoneCanon = normalizePhoneForStorage(snap.phone);

  if (!nameTrim && !phoneCanon) {
    return { customerId: null, isWalkIn: true };
  }

  if (phoneCanon) {
    const existing = await tx.customer.findUnique({ where: { phone: phoneCanon } });
    if (existing) {
      if (nameTrim) {
        await tx.customer.update({
          where: { id: existing.id },
          data: { fullName: nameTrim },
        });
      }
      return { customerId: existing.id, isWalkIn: false };
    }
    const displayName = nameTrim || `Customer ${phoneCanon}`;
    const created = await tx.customer.create({
      data: {
        fullName: displayName,
        phone: phoneCanon,
      },
    });
    return { customerId: created.id, isWalkIn: false };
  }

  const created = await tx.customer.create({
    data: {
      fullName: nameTrim,
      phone: null,
    },
  });
  return { customerId: created.id, isWalkIn: false };
}
