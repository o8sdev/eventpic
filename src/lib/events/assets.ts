import "server-only";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { uuidSchema, type PhotographerEvent } from "./schema";
import { apiError } from "./api";
export async function assetAccess(eventId: string) {
  if (!uuidSchema.safeParse(eventId).success)
    return { response: apiError("invalid", 400) };
  if (!isConfigured()) return { response: apiError("setup", 503) };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { response: apiError("signIn", 401) };
  const { data, error } = await client
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("photographer_id", user.id)
    .maybeSingle();
  if (error) return { response: apiError("setup", 503) };
  if (!data) return { response: apiError("unavailable", 404) };
  return { event: data as PhotographerEvent };
}
