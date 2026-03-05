import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

const AGENT_PORT = process.env.CREATIVE_PACK_PORT ?? "3010";
const AGENT_HOST = process.env.AGENT_HOST ?? "http://localhost";
const AGENT_URL  = `${AGENT_HOST}:${AGENT_PORT}/api/compile`;

const VALID_BRANDS = ["LLIF", "BestLife"];

// ── POST /api/agents/creative-pack-generator ──────────────────────────────────
// Body: { brandKey, campaignSlug?, campaignTitle?, keyMessage?, cta?, force? }

export async function POST(req: NextRequest) {
  let session: Awaited<ReturnType<typeof requireAuth>>;
  try {
    session = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const {
    brandKey,
    campaignSlug,
    campaignTitle,
    keyMessage,
    cta,
    campaignMonth,
    force = false,
    provider,
  } = body;

  if (!brandKey || !VALID_BRANDS.includes(String(brandKey))) {
    return NextResponse.json(
      { error: `brandKey must be one of: ${VALID_BRANDS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!campaignSlug && !campaignTitle) {
    return NextResponse.json(
      { error: "campaignSlug or campaignTitle is required" },
      { status: 400 }
    );
  }

  const job = await db.agentJob.create({
    data: {
      type: "creative-pack-generator",
      status: "running",
      input: { brandKey, campaignSlug, campaignTitle, keyMessage, cta, campaignMonth, force: Boolean(force) } as object,
      createdByUserId: session.id,
    },
  });

  try {
    const agentRes = await fetch(AGENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandKey, campaignSlug, campaignTitle, keyMessage, cta,
        campaignMonth, force: Boolean(force), provider,
      }),
      // Copy generation can take several minutes
      signal: AbortSignal.timeout(300_000),
    });

    if (!agentRes.ok) {
      const err = await agentRes.json().catch(() => ({ error: `HTTP ${agentRes.status}` })) as { error?: string };
      const msg = err.error ?? `Agent returned HTTP ${agentRes.status}`;
      await db.agentJob.update({ where: { id: job.id }, data: { status: "failed", error: msg } });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const data = await agentRes.json() as {
      result: string;
      brandKey: string;
      campaignSlug: string;
      generated: string[];
      skipped:   string[];
      warnings:  string[];
    };

    await db.agentJob.update({
      where: { id: job.id },
      data: { status: "completed", output: data as object },
    });

    return NextResponse.json({
      ok:           true,
      jobId:        job.id,
      brandKey:     data.brandKey,
      campaignSlug: data.campaignSlug,
      generated:    data.generated ?? [],
      skipped:      data.skipped   ?? [],
      warnings:     data.warnings  ?? [],
      result:       data.result,
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    await db.agentJob.update({ where: { id: job.id }, data: { status: "failed", error: msg } });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// ── GET /api/agents/creative-pack-generator ───────────────────────────────────
// Returns recent job history for the creative-tools UI.

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await db.agentJob.findMany({
    where: { type: "creative-pack-generator" },
    orderBy: { createdAt: "desc" },
    take: 25,
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
