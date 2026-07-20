import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge middleware uses only the DB-free config; it decodes the JWT to gate
// routes. Credential checking never runs here.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware(() => {
  // The `authorized` callback in authConfig performs the allow/redirect
  // decision; returning here simply proceeds when allowed.
});

export const config = {
  matcher: ["/dashboard/:path*", "/train/:path*", "/analytics/:path*", "/history/:path*", "/login", "/signup"],
};
