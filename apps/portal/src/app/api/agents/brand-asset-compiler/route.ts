import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

const AGENT_PORT = process.env.BRAND_ASSET_COMPILER_PORT ?? "3009";
const AGENT_HOST = process.env.AGENT_HOST ?? "http://localhost";
const AGENT_URL  = `${AGENT_HOST}:${AGENT_PORT}/api/compile`;

const VALID_BRANDS = ["LLIF", "BestLife"];

// ── POST /api/agents/brand-asset-compiler ─────────────────────────────────────
// Body: { brandKey: "LLIF" | "BestLife", force?: boolean }

export async function POST(req: NextRequest) {
  let session: Awaited<ReturnType<typeof requireAuth>>;
  try {
    session = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { brandKey, force = false } = body;

  if (!brandKey || !VALID_BRANDS.includes(String(brandKey))) {
    return NextResponse.json(
      { error: `brandKey must be one of: ${VALID_BRANDS.join(", ")}` },
      { status: 400 }
    );
  }

  // Record job before calling the agent so we always have a trail
  const job = await db.agentJob.create({
    data: {
      type: "brand-asset-compiler",
      status: "running",
      input: { brandKey, force: Boolean(force) },
      createdByUserId: session.id,
    },
  });

  try {
    const agentRes = await fetch(AGENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandKey, force: Boolean(force) }),
      // Allow up to 3 minutes — large images can be slow
      signal: AbortSignal.timeout(180_000),
    });

    if (!agentRes.ok) {
      const errBody = await agentRes.json().catch(() => ({ error: `HTTP ${agentRes.status}` })) as { error?: string };
      const msg = errBody.error ?? `Agent returned HTTP ${agentRes.status}`;
      await db.agentJob.update({
        where: { id: job.id },
        data: { status: "failed", error: msg, output: errBody as object },
      });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const data = await agentRes.json() as {
      result: string;
      brandKey: string;
      generated: string[];
      skipped: string[];
      warnings: string[];
    };

    await db.agentJob.update({
      where: { id: job.id },
      data: { status: "completed", output: data as object },
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      brandKey: data.brandKey,
      generated: data.generated ?? [],
      skipped:   data.skipped   ?? [],
      warnings:  data.warnings  ?? [],
      result:    data.result,
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    await db.agentJob.update({
      where: { id: job.id },
      data: { status: "failed", error: msg },
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// ── GET /api/agents/brand-asset-compiler ──────────────────────────────────────
// Returns recent job history for the brand-tools UI.

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await db.agentJob.findMany({
    where: { type: "brand-asset-compiler" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id:        true,
      status:    true,
      input:     true,
      output:    true,
      error:     true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ jobs });
}
