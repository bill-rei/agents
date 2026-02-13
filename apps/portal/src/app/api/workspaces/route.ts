import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspaces = await db.workspace.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(workspaces);
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { name, slug } = await req.json();
  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  }
  const workspace = await db.workspace.create({ data: { name, slug } });
  return NextResponse.json(workspace, { status: 201 });
}
