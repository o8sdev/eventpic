import { NextRequest, NextResponse } from "next/server";
import { apiError, smallJson, uploadAccess } from "@/lib/events/api";
import { uploadSchema } from "@/lib/events/schema";
import { quotaError } from "@/lib/billing/schema";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const access = await uploadAccess(request, eventId);
  if (access.response) return access.response;
  let input: unknown;
  try {
    input = await smallJson(request);
  } catch {
    return apiError("invalid", 400);
  }
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return apiError("invalid", 400);
  const { data, error } = await access.client!.rpc("reserve_photo_upload", {
    p_event: eventId,
    p_key: parsed.data.upload_key,
    p_filename: parsed.data.original_filename,
    p_bytes: parsed.data.bytes,
  });
  if (error)
    return apiError(
      quotaError(error.message) ||
        (error.code === "42501" ? "unavailable" : "setup"),
      quotaError(error.message) ? 409 : error.code === "42501" ? 404 : 503,
    );
  const photo = data as { id: string; path: string; status: string };
  const headers = { "Cache-Control": "private, no-store" };
  if (photo.status !== "pending_upload")
    return NextResponse.json(
      { photoId: photo.id, complete: true, status: photo.status },
      { headers },
    );
  const { data: exists, error: existsError } = await access
    .client!.storage.from("originals")
    .exists(photo.path);
  if (existsError) return apiError("storageError", 503);
  if (exists)
    return NextResponse.json({ photoId: photo.id, present: true }, { headers });
  const { data: signed, error: signError } = await access
    .client!.storage.from("originals")
    .createSignedUploadUrl(photo.path, { upsert: false });
  if (signError) return apiError("storageError", 503);
  return NextResponse.json(
    { photoId: photo.id, signedUrl: signed.signedUrl },
    { headers },
  );
}
