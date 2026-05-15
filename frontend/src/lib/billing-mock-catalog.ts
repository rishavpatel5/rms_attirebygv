export type CatalogVariant = {
  sku: string;
  label: string;
  price: number;
};

export type CatalogProduct = {
  id: string;
  name: string;
  barcode: string;
  variants: CatalogVariant[];
};

export const catalogProducts: CatalogProduct[] = [
  {
    id: "p1",
    name: "Pro Training Tee",
    barcode: "8901000100012",
    variants: [
      { sku: "TEE-BLK-S", label: "Black / S", price: 1299 },
      { sku: "TEE-BLK-M", label: "Black / M", price: 1299 },
      { sku: "TEE-WHT-L", label: "White / L", price: 1299 },
    ],
  },
  {
    id: "p2",
    name: "Court Shorts",
    barcode: "8901000100029",
    variants: [
      { sku: "SHO-NVY-M", label: "Navy / M", price: 1899 },
      { sku: "SHO-NVY-L", label: "Navy / L", price: 1899 },
      { sku: "SHO-OLV-XL", label: "Olive / XL", price: 1999 },
    ],
  },
  {
    id: "p3",
    name: "Run Cap",
    barcode: "8901000100036",
    variants: [
      { sku: "CAP-BLK-1", label: "Black — OS", price: 799 },
      { sku: "CAP-GRY-1", label: "Grey — OS", price: 799 },
    ],
  },
  {
    id: "p4",
    name: "Merino Crew",
    barcode: "8901000100043",
    variants: [
      { sku: "MRN-BRN-M", label: "Brown / M", price: 3499 },
      { sku: "MRN-BRN-L", label: "Brown / L", price: 3499 },
    ],
  },
];

export function findProductByBarcode(code: string) {
  const trimmed = code.trim();
  return catalogProducts.find((p) => p.barcode === trimmed) ?? null;
}

export function searchCatalog(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return catalogProducts;
  return catalogProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.barcode.includes(q) ||
      p.variants.some(
        (v) =>
          v.sku.toLowerCase().includes(q) || v.label.toLowerCase().includes(q),
      ),
  );
}
