import { NextRequest, NextResponse } from "next/server";
import { assetAccess } from "@/lib/events/assets";
import { guestUrl } from "@/lib/events/server";
import { qrPng } from "@/lib/events/poster";
import { apiError } from "@/lib/events/api";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const access = await assetAccess(eventId);
  if (access.response) return access.response;
  const inline = z
    .enum(["0", "1"])
    .catch("0")
    .parse(request.nextUrl.searchParams.get("inline"));
  try {
    const png = await qrPng(guestUrl(access.event!.slug));
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${inline === "1" ? "inline" : "attachment"}; filename="SnapMatch-${access.event!.slug}.png"`,
      },
    });
  } catch {
    return apiError("assetError", 503);
  }
}
