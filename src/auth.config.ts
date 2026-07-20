import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config. This half is imported by middleware.ts, which
 * runs on the edge runtime — so it must NOT pull in Mongoose or bcrypt.
 * The credential-checking provider lives in auth.ts (Node runtime) instead.
 *
 * Route protection and the JWT↔session id plumbing live here because they
 * are shared by both the edge middleware and the Node server.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/train", "/analytics", "/history"];

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [], // real providers are added in auth.ts
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      if (pathname === "/login" || pathname === "/signup") {
        if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }

      const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
      if (isProtected) return isLoggedIn; // false → Auth.js redirects to /login
      return true;
    },
    jwt({ token, user }) {
      // `user` is only present on sign-in; persist the Mongo _id into the token
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = String(token.id);
      return session;
    },
  },
} satisfies NextAuthConfig;
