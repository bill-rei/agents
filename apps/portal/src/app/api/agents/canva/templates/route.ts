/**
 * GET /api/agents/canva/templates?brand=llif
 *
 * Returns client-safe template metadata (no internal templateId or fieldKeys).
 * Optional ?brand= filter.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  CANVA_TEMPLATES,
  toClientTemplate,
  type Brand,
} from "@/config/canvaTemplates";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brand = req.nextUrl.searchParams.get("brand") as Brand | null;

  const templates = brand
    ? CANVA_TEMPLATES.filter((t) => t.brand === brand)
    : CANVA_TEMPLATES;

  return NextResponse.json(templates.map(toClientTemplate));
}
