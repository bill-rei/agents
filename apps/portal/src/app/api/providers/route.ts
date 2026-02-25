import { NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/llmProviders";

/**
 * GET /api/providers
 *
 * Returns the list of configured LLM providers so the UI can build the
 * backend selector and disable providers whose API keys are missing.
 */
export async function GET() {
  return NextResponse.json({ providers: PROVIDERS });
}
