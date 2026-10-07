import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assetAccess } from "@/lib/events/assets";
import { apiError } from "@/lib/events/api";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const access = await assetAccess(eventId);
  if (access.response) return access.response;
  const page = z.coerce
    .number()
    .int()
    .min(0)
    .max(100000)
    .safeParse(request.nextUrl.searchParams.get("page") || 0);
  if (!page.success) return apiError("invalid", 400);
  const includePreviews = z
    .enum(["0", "1"])
    .safeParse(request.nextUrl.searchParams.get("previews") || "1");
  if (!includePreviews.success) return apiError("invalid", 400);
  const client = access.client!;
  const { data, count, error } = await client
    .from("photos")
    .select(
      "id,original_filename,bytes,face_count,unindexed_face_count,status,error,thumb_path,web_path",
      { count: "exact" },
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page.data * 48, page.data * 48 + 47);
  if (error) return apiError("setup", 503);
  const photos = data || [];
  const { data: state, error: stateError } = await client.rpc(
    "photo_processing_state",
    { p_event: eventId, p_photos: photos.map((photo) => photo.id) },
  );
  if (stateError) return apiError("setup", 503);
  async function signed(bucket: string, paths: string[]) {
    if (!paths.length || includePreviews.data === "0")
      return new Map<string, string>();
    const result = await client.storage
      .from(bucket)
      .createSignedUrls(paths, 3600);
    if (result.error || result.data?.some((item) => item.error))
      throw new Error("storage");
    return new Map(
      (result.data || []).map((item) => [item.path!, item.signedUrl]),
    );
  }
  try {
    const [thumbs, previews] = await Promise.all([
      signed(
        "thumbnails",
        photos.flatMap((photo) => (photo.thumb_path ? [photo.thumb_path] : [])),
      ),
      signed(
        "web",
        photos.flatMap((photo) => (photo.web_path ? [photo.web_path] : [])),
      ),
    ]);
    const jobs = state.jobs as {
      photo_id: string;
      status: string;
      attempts: number;
      max_attempts: number;
      run_after: string;
    }[];
    return NextResponse.json(
      {
        count: count || 0,
        counts: state.counts,
        photos: photos.map(({ thumb_path, web_path, ...photo }) => ({
          ...photo,
          thumbnail: thumbs.get(thumb_path || "") || null,
          preview: previews.get(web_path || "") || null,
          has_preview: !!thumb_path && !!web_path,
          job: jobs.find((job) => job.photo_id === photo.id) || null,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return apiError("storageError", 503);
  }
}
