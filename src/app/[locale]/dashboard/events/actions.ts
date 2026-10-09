"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { locales } from "@/lib/i18n";
import { eventSchema, MAX_COVER_BYTES, uuidSchema } from "@/lib/events/schema";
import { photographerSession, ownedEvent } from "@/lib/events/server";
import { quotaError } from "@/lib/billing/schema";
type FormState = { notice: string };
export async function saveEvent(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = z.enum(locales).parse(form.get("locale"));
  const { client, user } = await photographerSession(locale);
  const input = eventSchema.safeParse({
    id: form.get("id"),
    title: form.get("title"),
    event_date: form.get("event_date"),
    venue: form.get("venue"),
    languages: form.getAll("languages"),
    default_locale: form.get("default_locale"),
    allow_original_download: form.get("allow_original_download") === "on",
    watermark_enabled: form.get("watermark_enabled") === "on",
    expiry: form.get("expiry"),
  });
  if (!input.success) return { notice: "invalid" };
  const cover = form.get("cover");
  let image: Buffer | undefined;
  if (cover instanceof File && cover.size > 0) {
    const file = z
      .file()
      .max(MAX_COVER_BYTES)
      .mime(["image/jpeg", "image/png"])
      .safeParse(cover);
    if (!file.success) return { notice: "coverInvalid" };
    try {
      const decoder = sharp(Buffer.from(await file.data.arrayBuffer()), {
        limitInputPixels: 40_000_000,
        animated: false,
      });
      const metadata = await decoder.metadata();
      if (!["jpeg", "png"].includes(metadata.format || ""))
        return { notice: "coverInvalid" };
      image = await decoder
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      if (image.length > MAX_COVER_BYTES) return { notice: "coverInvalid" };
    } catch {
      return { notice: "coverInvalid" };
    }
  }
  const value = input.data;
  const { data: event, error } = await client.rpc("save_photographer_event", {
    p_id: value.id,
    p_title: value.title,
    p_event_date: value.event_date,
    p_venue: value.venue,
    p_languages: value.languages,
    p_default_locale: value.default_locale,
    p_originals: value.allow_original_download,
    p_watermark: value.watermark_enabled,
    p_expiry: value.expiry ? `${value.expiry}T00:00:00+04:00` : null,
  });
  if (error) return { notice: quotaError(error.message) || "saveError" };
  let notice = "saved";
  if (image) {
    const path = `${user.id}/${event.id}/cover/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await client.storage
      .from("branding")
      .upload(path, image, { contentType: "image/jpeg", upsert: false });
    if (uploadError) notice = "coverError";
    else {
      const { data: previous, error: setError } = await client.rpc(
        "set_event_cover",
        { p_event: event.id, p_path: path },
      );
      if (setError) {
        await client.storage.from("branding").remove([path]);
        notice = "coverError";
      } else if (previous)
        await client.storage.from("branding").remove([previous]);
    }
  }
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/dashboard/events/${event.id}`);
  redirect(`/${locale}/dashboard/events/${event.id}?notice=${notice}`);
}
export async function removeCover(form: FormData) {
  const locale = z.enum(locales).parse(form.get("locale"));
  const id = uuidSchema.parse(form.get("id"));
  const { client, event } = await ownedEvent(locale, id);
  if (!event) redirect(`/${locale}/dashboard`);
  const { data: previous, error } = await client.rpc("set_event_cover", {
    p_event: id,
    p_path: null,
  });
  if (!error && previous)
    await client.storage.from("branding").remove([previous]);
  revalidatePath(`/${locale}/dashboard/events/${id}`);
  redirect(
    `/${locale}/dashboard/events/${id}?notice=${error ? "coverError" : "saved"}`,
  );
}

export async function changeEventStatus(form: FormData) {
  const locale = z.enum(locales).parse(form.get("locale"));
  const id = uuidSchema.parse(form.get("id"));
  const status = z.enum(["active", "closed"]).parse(form.get("status"));
  const { client } = await photographerSession(locale);
  const { error } = await client.rpc("set_photographer_event_status", {
    p_event: id,
    p_status: status,
  });
  revalidatePath(`/${locale}/dashboard`);
  redirect(
    `/${locale}/dashboard/events/${id}?notice=${error ? quotaError(error.message) || "saveError" : "saved"}`,
  );
}
