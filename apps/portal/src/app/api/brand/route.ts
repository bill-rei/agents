import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveBrandKey, subdomainFromHost, getBrand } from "@/config/brand";

export const BRAND_COOKIE = "brandKey";

/**
 * GET /api/brand
 * Returns the resolved BrandConfig for the current request context.
 * Resolution order: ?brand query param → brandKey cookie → subdomain → env → fallback.
 */
export async function GET(req: NextRequest) {
  const queryBrand = req.nextUrl.searchParams.get("brand");
  const cookieStore = await cookies();
  const cookieBrand = cookieStore.get(BRAND_COOKIE)?.value ?? null;
  const subdomain = subdomainFromHost(req.headers.get("host"));

  const brandKey = resolveBrandKey({ queryBrand, cookieBrand, subdomain });
  const config = getBrand(brandKey);

  if (!config) {
    return NextResponse.json({ error: `Brand "${brandKey}" not found` }, { status: 404 });
  }

  return NextResponse.json(config);
}

/**
 * POST /api/brand
 * Body: { brandKey: string }
 * Persists the brand key in a cookie and returns the resolved config.
 * Used by the BrandSwitcher component.
 */
export async function POST(req: NextRequest) {
  let body: { brandKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = typeof body.brandKey === "string" ? body.brandKey : null;
  const config = getBrand(key);

  if (!config) {
    return NextResponse.json(
      { error: `Unknown brand key: "${key}"` },
      { status: 400 }
    );
  }

  const res = NextResponse.json(config);
  res.cookies.set(BRAND_COOKIE, config.brandKey, {
    httpOnly: false, // readable by client JS so BrandSwitcher can read it
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days
  });

  return res;
}
