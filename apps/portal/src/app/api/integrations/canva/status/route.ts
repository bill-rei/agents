/**
 * GET /api/integrations/canva/status
 *
 * Returns whether Canva is connected and who connected it.
 * Available to all authenticated users.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await db.integration.findUnique({
    where: { provider: "canva" },
    select: {
      scopes: true,
      expiresAt: true,
      createdAt: true,
      connectedBy: { select: { name: true, email: true } },
    },
  });

  if (!integration) {
    return NextResponse.json({ connected: false });
  }

  const isExpired =
    integration.expiresAt !== null && integration.expiresAt <= new Date();

  return NextResponse.json({
    connected: true,
    expired: isExpired,
    scopes: integration.scopes,
    connectedBy: integration.connectedBy,
    connectedAt: integration.createdAt,
  });
}
