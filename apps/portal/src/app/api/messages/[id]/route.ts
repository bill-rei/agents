import { NextRequest, NextResponse } from "next/server";
import {
  getMessage,
  submitForReview,
  approveAndPublishOrSchedule,
  requestEdits,
  updateAsset,
  setMessageStatus,
  addActivity,
  updatePipelineStep,
  getSampleContent,
} from "@/lib/mock";
import type { MockRole } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const msg = getMessage(params.id);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ message: msg });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { action, assetId, content, approverRole, approverName, note } = body;

  switch (action) {
    case "submit_review": {
      const msg = submitForReview(params.id);
      if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ message: msg });
    }

    case "approve": {
      const result = approveAndPublishOrSchedule(
        params.id,
        (approverRole as MockRole) ?? "admin",
        (approverName as string) ?? "Reviewer"
      );
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result);
    }

    case "request_edits": {
      const msg = requestEdits(params.id, note as string | undefined);
      if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ message: msg });
    }

    case "save_asset": {
      if (!assetId || typeof content !== "string")
        return NextResponse.json({ error: "assetId and content required" }, { status: 400 });
      const msg = updateAsset(params.id, assetId as string, content);
      if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ message: msg });
    }

    case "regenerate_asset": {
      if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
      const msg = getMessage(params.id);
      if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const asset = msg.assets.find((a) => a.id === assetId);
      if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

      // Simulate regeneration
      updatePipelineStep(params.id, "Compiler", "running");
      addActivity(params.id, {
        agentName: "Compiler",
        level: "info",
        message: `Regenerating ${asset.type} for ${msg.brand}…`,
      });

      const newContent = getSampleContent(asset.type, msg.brand, msg.idea);
      const updated = updateAsset(params.id, assetId as string, newContent);
      updatePipelineStep(params.id, "Compiler", "done");
      addActivity(params.id, {
        agentName: "Compiler",
        level: "info",
        message: `${asset.type} regenerated successfully.`,
      });

      return NextResponse.json({ message: updated });
    }

    case "generate": {
      // Simulate full generation pipeline
      const msg = getMessage(params.id);
      if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

      setMessageStatus(params.id, "generating");

      const steps = ["Strategist", "Compiler", "Editor", "Creative"] as const;
      for (const step of steps) {
        updatePipelineStep(params.id, step, "running");
        addActivity(params.id, {
          agentName: step,
          level: "info",
          message: `${step} processing ${msg.brand} message…`,
        });
        updatePipelineStep(params.id, step, "done");
        addActivity(params.id, {
          agentName: step,
          level: "info",
          message: `${step} complete.`,
        });
      }

      // Fill asset content
      for (const asset of msg.assets) {
        const content = getSampleContent(asset.type, msg.brand, msg.idea);
        updateAsset(params.id, asset.id, content);
      }

      setMessageStatus(params.id, "draft");
      const finalMsg = getMessage(params.id);
      return NextResponse.json({ message: finalMsg });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
