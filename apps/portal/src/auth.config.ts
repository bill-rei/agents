/**
 * auth.config.ts — Edge-safe Auth.js configuration
 *
 * This file is imported by middleware (Edge runtime) and must not reference
 * anything that requires Node.js APIs (e.g. Prisma, bcrypt, fs).
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/denied",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // Auth.js own routes and legacy login page are always public
      if (
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/api/auth/") ||
        pathname === "/login"
      ) {
        return true;
      }

      if (!isLoggedIn) {
        // Return 401 JSON for API routes instead of a redirect
        if (pathname.startsWith("/api/")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Redirect page routes to the sign-in page
        return false;
      }

      return true;
    },
  },
};
