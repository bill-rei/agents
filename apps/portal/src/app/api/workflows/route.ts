import { NextRequest, NextResponse } from "next/server";
import { listWorkflowTemplates, createWorkflowTemplate } from "@/lib/mock";
import { validatePipeline } from "@/lib/workflows";
import type { CreateWorkflowPayload } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ workflows: listWorkflowTemplates() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as CreateWorkflowPayload | null;
  if (!body?.name || !body?.brand || !body?.category || !body?.pipeline?.length) {
    return NextResponse.json(
      { error: "name, brand, category, and pipeline are required" },
      { status: 400 }
    );
  }

  const errors = validatePipeline(body.pipeline);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 422 });
  }

  const template = createWorkflowTemplate(body, "You");
  return NextResponse.json({ template }, { status: 201 });
}
