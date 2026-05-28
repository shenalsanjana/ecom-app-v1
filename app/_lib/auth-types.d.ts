// app/_lib/auth-types.d.ts
import type { DefaultSession } from "next-auth";
import type {} from "next-auth/jwt";

type AppRole = "ADMIN" | "CUSTOMER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
    } & DefaultSession["user"];
  }

  interface User {
    role?: AppRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: AppRole;
  }
}
