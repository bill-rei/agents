import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { saveProjectFile, deleteFile } from "@/lib/storage";

/** GET — list all project-level reference docs */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const docs = await db.asset.findMany({
    where: { projectId, scope: "project" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(docs);
}

/** POST — upload a new project-level reference doc */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const description = (formData.get("description") as string) || null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { storagePath } = await saveProjectFile(buffer, project.slug, file.name);

  const asset = await db.asset.create({
    data: {
      projectId,
      runId: null,
      scope: "project",
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: buffer.length,
      storagePath,
      tags: ["reference-doc"],
      description,
      createdByUserId: user.id,
    },
  });

  return NextResponse.json(asset, { status: 201 });
}

/** DELETE — remove a project doc by id (passed as query param) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const assetId = req.nextUrl.searchParams.get("assetId");
  if (!assetId) {
    return NextResponse.json({ error: "assetId query param required" }, { status: 400 });
  }

  const asset = await db.asset.findFirst({
    where: { id: assetId, projectId, scope: "project" },
  });
  if (!asset) {
    return NextResponse.json({ error: "Doc not found" }, { status: 404 });
  }

  deleteFile(asset.storagePath);
  await db.asset.delete({ where: { id: assetId } });

  return NextResponse.json({ ok: true });
}
