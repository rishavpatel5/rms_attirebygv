import { UserRole } from "@prisma/client";

/** Any authenticated staff can read catalog/inventory. */
export const ROLES_READ_ALL: UserRole[] = [
  UserRole.ADMIN,
  UserRole.CASHIER,
  UserRole.INVENTORY_MANAGER,
];

export const ROLES_CATALOG_WRITE: UserRole[] = [
  UserRole.ADMIN,
  UserRole.INVENTORY_MANAGER,
];

export const ROLES_INVENTORY_WRITE: UserRole[] = [
  UserRole.ADMIN,
  UserRole.INVENTORY_MANAGER,
];

/** POS billing: sales, refunds, exchanges. */
export const ROLES_POS_WRITE: UserRole[] = [UserRole.ADMIN, UserRole.CASHIER];

/** Purchasing, suppliers, and supplier payments. */
export const ROLES_PURCHASE_WRITE: UserRole[] = [
  UserRole.ADMIN,
  UserRole.INVENTORY_MANAGER,
];
