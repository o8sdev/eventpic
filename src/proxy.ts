import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { englishPath } from "@/lib/i18n";
export async function proxy(request: NextRequest) {
  const pathname = englishPath(request.nextUrl.pathname);
  if (
    pathname !== request.nextUrl.pathname &&
    ["GET", "HEAD"].includes(request.method)
  ) {
    const target = request.nextUrl.clone();
    target.pathname = pathname;
    return NextResponse.redirect(target);
  }
  const headers = new Headers(request.headers);
  headers.set("x-snapmatch-locale", "en");
  let response = NextResponse.next({ request: { headers } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        headers.set("cookie", request.headers.get("cookie") || "");
        response = NextResponse.next({ request: { headers } });
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  await client.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
