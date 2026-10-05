import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { locales } from "@/lib/i18n";
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const locale = z.enum(locales).catch("az").parse(query.get("locale"));
  const origin = z.url().parse(process.env.SITE_URL || "http://localhost:3000");
  const fail = () =>
    NextResponse.redirect(new URL(`/${locale}?notice=authError`, origin));
  if (!isConfigured()) return fail();
  const client = await createClient();
  const code = z.string().min(1).max(2048).safeParse(query.get("code"));
  const token = z.string().min(1).max(2048).safeParse(query.get("token_hash"));
  // No user-controlled redirect target. Both flows finish on this locale's dashboard.
  const result = code.success
    ? await client.auth.exchangeCodeForSession(code.data)
    : token.success && query.get("type") === "email"
      ? await client.auth.verifyOtp({ token_hash: token.data, type: "email" })
      : null;
  if (!result || result.error) return fail();
  const response = NextResponse.redirect(
    new URL(`/${locale}/dashboard`, origin),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
