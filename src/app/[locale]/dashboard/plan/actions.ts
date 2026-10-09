"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { locales } from "@/lib/i18n";
import { photographerSession } from "@/lib/events/server";

export async function releaseUnusedUploads(form: FormData) {
  const locale=z.enum(locales).parse(form.get("locale"));
  const {client}=await photographerSession(locale);
  const {error}=await client.rpc("release_unused_uploads");
  redirect(`/${locale}/dashboard/plan?notice=${error?"error":"released"}`);
}
