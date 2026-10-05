import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient, isConfigured } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n";
import { uuidSchema, type PhotographerEvent } from "./schema";
export async function photographerSession(locale: Locale) {
  if (!isConfigured()) redirect(`/${locale}/login`);
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  return { client, user };
}
export async function ownedEvent(locale: Locale, id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const session = await photographerSession(locale);
  const { data, error } = await session.client
    .from("events")
    .select("*")
    .eq("id", id)
    .eq("photographer_id", session.user.id)
    .maybeSingle();
  if (error) return { ...session, event: null, error: true };
  if (!data) notFound();
  return { ...session, event: data as PhotographerEvent, error: false };
}
export function guestUrl(slug: string) {
  // Origin comes from deployment configuration, never Host or client input.
  const url = new URL(process.env.SITE_URL || "http://localhost:3000");
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Invalid site origin");
  return new URL(`/e/${slug}`, url.origin).toString();
}
