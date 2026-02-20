/**
 * lib/authorization.ts — Role-gate helpers
 *
 * Use these in server actions, API routes, and UI components to enforce
 * role-based access control.
 *
 * Roles (V1):
 *   admin     — full rights, no restrictions
 *   approver  — can edit and approve; cannot publish
 *   publisher — can publish approved items; cannot change admin settings
 */
import type { Role } from "@prisma/client";

/** admin + approver can create/edit content */
export function canEdit(role: Role): boolean {
  return role === "admin" || role === "approver";
}

/** admin + approver can approve artifacts */
export function canApprove(role: Role): boolean {
  return role === "admin" || role === "approver";
}

/** admin + publisher can publish approved artifacts */
export function canPublish(role: Role): boolean {
  return role === "admin" || role === "publisher";
}

/** true only for the admin role */
export function isAdmin(role: Role): boolean {
  return role === "admin";
}

/**
 * Server-side guard — throws if the role is not in the allowed list.
 *
 * @example
 *   const user = await requireAuth();
 *   requireRole(user.role, ["admin", "approver"]);
 */
export function requireRole(role: Role, allowed: Role[]): void {
  if (!allowed.includes(role)) {
    throw new Error("Forbidden");
  }
}
