import type { DefaultSession } from "next-auth";

// Carry the MongoDB user _id through the session so API routes can scope
// every query to the authenticated user.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
