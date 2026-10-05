import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, isConfigured } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n";
import { defaultSiteContent } from "./defaults";
import { siteContentSchema } from "./schema";

// Per-request memoization. Publishing appears on the next request; no stale global cache.
export const getSiteContent = cache(async (locale: Locale) => {
  const fallback = defaultSiteContent(locale);
  if (!isConfigured()) return fallback;
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("get_site_content", {
      p_locale: locale,
    });
    if (error || !data) return fallback;
    const result = siteContentSchema.safeParse(data);
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
});

export const getAdminSession = cache(async () => {
  if (!isConfigured())
    return { client: null, user: null, admin: false, available: false };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { client, user: null, admin: false, available: true };
  const { data, error } = await client.rpc("is_system_admin");
  return { client, user, admin: data === true, available: !error };
});

// Every page checks authorization as well as the layout: layouts can be reused
// across navigation, and their checks must never be the only access boundary.
export async function requireAdminSession(locale: Locale) {
  const session = await getAdminSession();
  if (!session.user) redirect(`/${locale}/login`);
  if (!session.available) return null;
  if (!session.admin || !session.client) notFound();
  return { ...session, client: session.client };
}
