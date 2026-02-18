import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listContentItems } from "@/lib/contentItemStore";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = listContentItems();
  // Return newest first
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json(items);
}
