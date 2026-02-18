import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { publishDesignLockedPage } from "@/lib/wp/publishDesignLockedPage";

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { slug, title, artifact, status } = body;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "slug is required (string)" }, { status: 400 });
  }

  if (!artifact || typeof artifact !== "object") {
    return NextResponse.json({ error: "artifact is required (object)" }, { status: 400 });
  }

  if (status && status !== "draft" && status !== "publish") {
    return NextResponse.json(
      { error: 'status must be "draft" or "publish"' },
      { status: 400 }
    );
  }

  try {
    const result = await publishDesignLockedPage({
      slug: slug as string,
      title: title as string | undefined,
      artifact,
      status: status as "draft" | "publish" | undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Validation errors → 422
    if (message.includes("validation failed")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    // Missing credentials → 500
    if (message.includes("Missing") && message.includes("credentials")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // WP API errors
    if (message.includes("WP")) {
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
