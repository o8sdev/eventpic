import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { locales } from "@/lib/i18n";
import { authNotice } from "@/lib/auth-notice";
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const locale = z.enum(locales).catch("en").parse(query.get("locale"));
  const origin = z.url().parse(process.env.SITE_URL || "http://localhost:3000");
  const fail = (errorCode?: string) => {
    const response = NextResponse.redirect(
      new URL(`/${locale}/login?notice=${authNotice(errorCode)}`, origin),
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  if (!isConfigured()) return fail();
  if (query.has("error")) return fail(query.get("error_code") ?? undefined);
  const client = await createClient();
  const code = z.string().min(1).max(2048).safeParse(query.get("code"));
  const token = z.string().min(1).max(2048).safeParse(query.get("token_hash"));
  const flowId = query.get("sb_flow_id");
  if (flowId !== null && !/^[a-zA-Z0-9_-]{8,64}$/.test(flowId)) return fail();
  // No user-controlled redirect target; trusted membership selects the destination.
  const result = code.success
    ? await client.auth.exchangeCodeForSession(
        code.data,
        flowId ? { flowId } : undefined,
      )
    : token.success && query.get("type") === "email"
      ? await client.auth.verifyOtp({ token_hash: token.data, type: "email" })
      : null;
  if (!result || result.error) return fail(result?.error?.code);
  const { data: admin } = await client.rpc("is_system_admin");
  const response = NextResponse.redirect(
    new URL(`/${locale}/${admin === true ? "admin" : "dashboard"}`, origin),
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
