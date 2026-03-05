import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getConnector } from "@/connectors/registry";
import type { UCSBrandMode } from "@/lib/ucs/schema";

/** Strip ciphertext fields from responses — never expose tokens to the client. */
function safeConn(c: {
  id: string;
  brandMode: string;
  platform: string;
  externalAccountId: string;
  displayName: string;
  expiresAt: Date | null;
  scopesJson: unknown;
  connectedAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    brandMode: c.brandMode,
    platform: c.platform,
    externalAccountId: c.externalAccountId,
    displayName: c.displayName,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    scopes: c.scopesJson as string[],
    connectedAt: c.connectedAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    expired: c.expiresAt ? c.expiresAt < new Date() : false,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brandMode = req.nextUrl.searchParams.get("brandMode") as UCSBrandMode | null;
  const connections = await db.channelConnection.findMany({
    where: brandMode ? { brandMode: brandMode as any } : undefined,
    orderBy: { connectedAt: "desc" },
  });

  return NextResponse.json(connections.map(safeConn));
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.channelConnection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  // POST = test connection
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const conn = await db.channelConnection.findUnique({ where: { id } });
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const connector = getConnector(conn.platform);
  const result = await connector.testConnection(conn);
  return NextResponse.json(result);
}
