/**
 * auth.ts — Full Auth.js configuration (Node.js runtime only)
 *
 * Imports Prisma — do NOT import this file in middleware.
 * Use auth.config.ts for edge-compatible config.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

// ─── Type augmentation ────────────────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}

// ─── Allowlist + role map ─────────────────────────────────────────────────────

const ALLOWED_EMAILS: ReadonlySet<string> = new Set(
  (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const EMAIL_ROLE_MAP: Record<string, Role> = {
  "bill@llif.org": "admin",
  "jim@llif.org": "approver",
  "jose@llif.org": "publisher",
};

// ─── Auth.js instance ─────────────────────────────────────────────────────────

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    // authorized is already defined in authConfig — keep it
    authorized: authConfig.callbacks!.authorized,

    /**
     * signIn — enforce allowlist + email_verified, upsert user record.
     * Returning a string redirects to that URL; returning false cancels sign-in.
     */
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      if (!profile?.email_verified) return "/auth/denied?reason=unverified";

      const email = (profile.email ?? "").toLowerCase();

      if (!ALLOWED_EMAILS.has(email)) {
        return "/auth/denied?reason=not_allowed";
      }

      const role = EMAIL_ROLE_MAP[email];
      if (!role) return "/auth/denied?reason=no_role";

      // Upsert user — create on first sign-in, update on subsequent logins
      await db.user.upsert({
        where: { email },
        update: {
          name: profile.name ?? email,
          image: (profile.picture as string | undefined) ?? null,
          lastLoginAt: new Date(),
          // Role is intentionally NOT updated here so manual overrides persist
        },
        create: {
          email,
          name: profile.name ?? email,
          image: (profile.picture as string | undefined) ?? null,
          role,
          lastLoginAt: new Date(),
        },
      });

      return true;
    },

    /**
     * jwt — enrich token with id + role on initial sign-in only.
     * After that the values are carried in the signed JWT.
     */
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        const email = profile.email.toLowerCase();
        const dbUser = await db.user.findUnique({
          where: { email },
          select: { id: true, role: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },

    /**
     * session — expose id + role from JWT to the client-side session object.
     */
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
});
