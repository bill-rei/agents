import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { validateBrandBoundary } from "@/lib/targetRegistry";

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
  const body = await req.json();
  const { name, slug } = body;

  // Support both old (targetRegistryKey) and new (targetRegistryKeys) API
  const keys: string[] = body.targetRegistryKeys
    || (body.targetRegistryKey ? [body.targetRegistryKey] : []);

  if (!name || !slug || keys.length === 0) {
    return NextResponse.json(
      { error: "name, slug, and at least one target registry key required" },
      { status: 400 }
    );
  }

  // Enforce brand boundary — all targets must belong to the same brand
  const brandCheck = validateBrandBoundary(keys);
  if (!brandCheck.valid) {
    return NextResponse.json({ error: brandCheck.error }, { status: 400 });
  }

  const project = await db.project.create({
    data: {
      workspaceId,
      name,
      slug,
      targetRegistryKey: keys[0],       // backward compat
      targetRegistryKeys: keys,
    },
  });
  return NextResponse.json(project, { status: 201 });
}
