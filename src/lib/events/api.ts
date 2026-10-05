import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { uuidSchema } from "./schema";
export function apiError(code: string, status: number) {
  return NextResponse.json(
    { error: code },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function uploadAccess(request: NextRequest, eventId: string) {
  const expected = new URL(process.env.SITE_URL || "http://localhost:3000")
    .origin;
  if (request.headers.get("origin") !== expected)
    return { response: apiError("forbidden", 403) };
  if (!uuidSchema.safeParse(eventId).success)
    return { response: apiError("invalid", 400) };
  if (!isConfigured()) return { response: apiError("setup", 503) };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { response: apiError("signIn", 401) };
  const { data: event, error } = await client
    .from("events")
    .select("id,status")
    .eq("id", eventId)
    .eq("photographer_id", user.id)
    .maybeSingle();
  if (error) return { response: apiError("setup", 503) };
  if (!event) return { response: apiError("unavailable", 404) };
  if (!["draft", "active"].includes(event.status))
    return { response: apiError("readOnly", 409) };
  return { client, user };
}
export async function smallJson(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Invalid JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) throw new Error("Body too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function hasJpegHeader(url: string) {
  const response = await fetch(url, {
    headers: { Range: "bytes=0-2" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.body) return false;
  const reader = response.body.getReader();
  const bytes: number[] = [];
  try {
    while (bytes.length < 3) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const byte of value) {
        bytes.push(byte);
        if (bytes.length === 3) break;
      }
    }
  } finally {
    await reader.cancel();
  }
  return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
