"use server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { locales } from "@/lib/i18n";
import { getAdminSession } from "@/lib/site/server";
import { siteContentSchema } from "@/lib/site/schema";

async function runContentChange(form: FormData) {
  const locale = z.enum(locales).parse(form.get("locale"));
  const action = z
    .enum(["save", "publish", "restore"])
    .safeParse(form.get("action"));
  const version = z.coerce.number().int().min(0).safeParse(form.get("version"));
  if (!action.success || !version.success) return { locale, notice: "invalid" };
  const { client, user, admin, available } = await getAdminSession();
  if (!user) redirect(`/${locale}/login`);
  if (!available) redirect(`/${locale}/admin`);
  if (!admin || !client) notFound();
  let document: unknown;
  let restoreVersion: number | null = null;
  if (action.data === "save") {
    const raw = form.get("content");
    if (typeof raw !== "string" || raw.length > 100000)
      return { locale, notice: "invalid" };
    try {
      document = JSON.parse(raw);
    } catch {
      return { locale, notice: "invalid" };
    }
  } else if (action.data === "publish") {
    const { data, error } = await client
      .from("site_content")
      .select("draft")
      .eq("locale", locale)
      .single();
    if (error) return { locale, notice: "error" };
    document = data.draft;
  } else {
    const restore = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(form.get("restore_version"));
    if (!restore.success) return { locale, notice: "invalid" };
    restoreVersion = restore.data;
    const { data, error } = await client
      .from("site_content_revisions")
      .select("snapshot")
      .eq("locale", locale)
      .eq("version", restoreVersion)
      .single();
    if (error) return { locale, notice: "error" };
    document = data.snapshot;
  }
  const parsed = siteContentSchema.safeParse(document);
  if (!parsed.success) return { locale, notice: "invalid" };
  const { error } = await client.rpc("admin_content_change", {
    p_locale: locale,
    p_action: action.data,
    p_content: parsed.data,
    p_expected_version: version.data,
    p_restore_version: restoreVersion,
  });
  const notice = error
    ? error.code === "40001"
      ? "conflict"
      : "error"
    : { save: "saved", publish: "published", restore: "restored" }[action.data];
  return { locale, notice };
}

export async function changeContent(form: FormData) {
  const result = await runContentChange(form);
  redirect(`/${result.locale}/admin/edit?notice=${result.notice}`);
}

export async function saveDraft(
  _previous: { notice: string },
  form: FormData,
): Promise<{ notice: string }> {
  form.set("action", "save");
  const result = await runContentChange(form);
  if (result.notice === "saved")
    redirect(`/${result.locale}/admin/edit?notice=saved`);
  return { notice: result.notice };
}
