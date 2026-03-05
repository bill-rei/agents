import { NextRequest, NextResponse } from "next/server";
import {
  getWorkflowTemplate,
  updateWorkflowTemplate,
  applyWorkflowTemplateToMessage,
  createMessage,
} from "@/lib/mock";
import { validatePipeline } from "@/lib/workflows";
import type { Brand } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tmpl = getWorkflowTemplate(params.id);
  if (!tmpl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template: tmpl });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { action } = body;

  // Update template
  if (!action || action === "update") {
    if (body.pipeline) {
      const errors = validatePipeline(body.pipeline as import("@/lib/types").AgentStepName[]);
      if (errors.length > 0) {
        return NextResponse.json({ error: errors.join(" ") }, { status: 422 });
      }
    }
    const tmpl = updateWorkflowTemplate(params.id, body as Parameters<typeof updateWorkflowTemplate>[1]);
    if (!tmpl) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ template: tmpl });
  }

  // "Use" action: create a message draft from the template and return its ID
  if (action === "use") {
    const { idea, brand } = body as { idea?: string; brand?: Brand };
    if (!idea || !brand) {
      return NextResponse.json(
        { error: "idea and brand are required to use a template" },
        { status: 400 }
      );
    }
    const payload = applyWorkflowTemplateToMessage(params.id, { idea, brand });
    const msg = createMessage(payload, "You");
    return NextResponse.json({ messageId: msg.id, message: msg }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
