import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  hasJpegHeader,
  smallJson,
  uploadAccess,
} from "@/lib/events/api";
import { z } from "zod";
import { uuidSchema } from "@/lib/events/schema";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; photoId: string }> },
) {
  const { eventId, photoId } = await params;
  const access = await uploadAccess(request, eventId);
  if (access.response) return access.response;
  if (!uuidSchema.safeParse(photoId).success) return apiError("invalid", 400);
  try {
    if (
      !z
        .object({})
        .strict()
        .safeParse(await smallJson(request)).success
    )
      return apiError("invalid", 400);
  } catch {
    return apiError("invalid", 400);
  }
  const { data: photo, error } = await access
    .client!.from("photos")
    .select("status,original_path")
    .eq("id", photoId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) return apiError("setup", 503);
  if (!photo) return apiError("unavailable", 404);
  if (photo.status === "pending_upload") {
    const { data: signed, error: signError } = await access
      .client!.storage.from("originals")
      .createSignedUrl(photo.original_path, 60);
    if (signError) return apiError("storageError", 409);
    try {
      if (!(await hasJpegHeader(signed.signedUrl)))
        return apiError("invalidJpeg", 422);
    } catch {
      return apiError("storageError", 503);
    }
  }
  const { data: status, error: completeError } = await access.client!.rpc(
    "complete_photo_upload",
    { p_event: eventId, p_photo: photoId },
  );
  if (completeError)
    return apiError(
      completeError.code === "42501" ? "unavailable" : "storageError",
      409,
    );
  return NextResponse.json(
    { status },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
