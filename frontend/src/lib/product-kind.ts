export const PRODUCT_KINDS = ["APPAREL", "ACCESSORY"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export function kindLabel(kind: string): string {
  return kind === "APPAREL" ? "Clothing" : "Accessories";
}

export function splitByProductKind<T extends { kind?: string; productKind?: string }>(
  items: T[],
): { apparel: T[]; accessory: T[] } {
  const apparel: T[] = [];
  const accessory: T[] = [];
  for (const item of items) {
    const k = item.productKind ?? item.kind;
    if (k === "ACCESSORY") accessory.push(item);
    else apparel.push(item);
  }
  return { apparel, accessory };
}
