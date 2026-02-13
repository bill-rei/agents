import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const projects = await db.project.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const { name, slug, targetRegistryKey } = await req.json();
  if (!name || !slug || !targetRegistryKey) {
    return NextResponse.json({ error: "name, slug, and targetRegistryKey required" }, { status: 400 });
  }
  const project = await db.project.create({
    data: { workspaceId, name, slug, targetRegistryKey },
  });
  return NextResponse.json(project, { status: 201 });
}
