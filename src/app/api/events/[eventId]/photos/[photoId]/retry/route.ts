import { NextRequest, NextResponse } from "next/server";
import { apiError, uploadAccess } from "@/lib/events/api";
import { uuidSchema } from "@/lib/events/schema";
import { quotaError } from "@/lib/billing/schema";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; photoId: string }> },
) {
  const { eventId, photoId } = await params;
  if (!uuidSchema.safeParse(photoId).success) return apiError("invalid", 400);
  const access = await uploadAccess(request, eventId);
  if (access.response) return access.response;
  const { error } = await access.client!.rpc("retry_photo_processing", {
    p_event: eventId,
    p_photo: photoId,
  });
  if (error)
    return apiError(
      quotaError(error.message) || "retryUnavailable",
      error.code === "42501" ? 404 : 409,
    );
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
