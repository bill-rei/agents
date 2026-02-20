/**
 * middleware.ts — Route protection via Auth.js (Edge runtime)
 *
 * Uses the edge-safe authConfig so Prisma is never imported here.
 * The authorized() callback in auth.config.ts handles the logic:
 *   - Unauthenticated page requests  → redirect to /auth/signin
 *   - Unauthenticated API requests   → 401 JSON response
 *   - Auth + legacy login pages      → always allowed
 */
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Run on all paths except Next.js internals and static assets
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
