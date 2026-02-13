import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { saveFile } from "@/lib/storage";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const runId = formData.get("runId") as string | null;
  const projectId = formData.get("projectId") as string | null;
  const tagsRaw = formData.get("tags") as string | null;

  if (!file || !runId || !projectId) {
    return NextResponse.json({ error: "file, runId, and projectId required" }, { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const { storagePath } = await saveFile(buffer, project.slug, runId, file.name);

  const asset = await db.asset.create({
    data: {
      runId,
      projectId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: buffer.length,
      storagePath,
      tags,
      createdByUserId: user.id,
    },
  });

  return NextResponse.json(asset, { status: 201 });
}
