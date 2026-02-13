import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ArtifactStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { artifactId, decision, notes } = await req.json();
  if (!artifactId || !decision) {
    return NextResponse.json({ error: "artifactId and decision required" }, { status: 400 });
  }

  const approval = await db.approval.create({
    data: { artifactId, userId: user.id, decision, notes: notes || "" },
  });

  // Update artifact status based on decision
  const statusMap: Record<string, ArtifactStatus> = {
    approved: "approved",
    rejected: "rejected",
    needs_changes: "review",
  };
  const newStatus = statusMap[decision];
  if (newStatus) {
    await db.artifact.update({ where: { id: artifactId }, data: { status: newStatus } });
  }

  return NextResponse.json(approval, { status: 201 });
}
