import type { UserRole } from "@prisma/client";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  typ: "access";
};

export type AuthContext = {
  userId: string;
  email: string;
  role: UserRole;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};
