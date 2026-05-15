import type { UserRole } from "@prisma/client";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: string;
      email: string;
      role: UserRole;
    };
  }
}

export {};
