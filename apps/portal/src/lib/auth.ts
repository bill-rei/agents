/**
 * lib/auth.ts — Session helpers backed by Auth.js (NextAuth v5)
 *
 * getSession() and requireAuth() now read the Auth.js JWT cookie.
 * Legacy JWT + bcrypt functions are retained for the /api/auth/login route.
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "./db";

// ─── Auth.js-backed session ───────────────────────────────────────────────────

/**
 * Returns the full User record for the current session, or null.
 * Works in Server Components, Route Handlers, and Server Actions.
 */
export async function getSession() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return db.user.findUnique({ where: { email: session.user.email } });
}

/**
 * Requires an authenticated session. Throws "Unauthorized" if unauthenticated.
 */
export async function requireAuth() {
  const user = await getSession();
  if (!user) throw new Error("Unauthorized");
  return user;
}

// ─── Legacy JWT helpers (kept for backward compatibility) ────────────────────

const JWT_SECRET = process.env.PORTAL_JWT_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "portal_session";
const MAX_AGE = 86400; // 1 day

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export function createToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: MAX_AGE });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string) {
  return {
    "Set-Cookie": `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE}`,
  };
}

export function clearSessionCookie() {
  return {
    "Set-Cookie": `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  };
}

/** @deprecated Legacy cookie session — used only by /api/auth/login. */
export async function getLegacySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return db.user.findUnique({ where: { id: payload.userId } });
}
