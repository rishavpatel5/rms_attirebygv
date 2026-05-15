import { ProductKind } from "@prisma/client";

/** Intra-state CGST+SGST split for apparel (5%) vs accessories (18%). */
export function defaultIntraStateGstPercentages(kind: ProductKind): {
  cgst: number;
  sgst: number;
  igst: number;
} {
  if (kind === "APPAREL") {
    return { cgst: 2.5, sgst: 2.5, igst: 0 };
  }
  return { cgst: 9, sgst: 9, igst: 0 };
}
