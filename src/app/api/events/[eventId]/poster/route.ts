import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { locales } from "@/lib/i18n";
import { assetAccess } from "@/lib/events/assets";
import { guestUrl } from "@/lib/events/server";
import { eventPoster } from "@/lib/events/poster";
import { apiError } from "@/lib/events/api";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const access = await assetAccess(eventId);
  if (access.response) return access.response;
  const locale = z
    .enum(locales)
    .catch("en")
    .parse(request.nextUrl.searchParams.get("locale"));
  const event = access.event!;
  try {
    const pdf = await eventPoster({
      title: event.title,
      venue: event.venue,
      date: event.event_date,
      expiry: event.face_expires_at,
      url: guestUrl(event.slug),
      locale,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="SnapMatch-${event.slug}-${locale}.pdf"`,
      },
    });
  } catch {
    return apiError("assetError", 503);
  }
}
