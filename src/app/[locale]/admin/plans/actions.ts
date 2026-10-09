"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { locales } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/site/server";
import { pricingSchema, assignmentSchema } from "@/lib/billing/schema";

export async function savePricing(
  _previous: { notice: string },
  form: FormData,
): Promise<{ notice: string }> {
  const locale = z.enum(locales).parse(form.get("locale"));
  const session = await requireAdminSession(locale);
  if (!session) return { notice: "error" };
  const version = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(form.get("revision"));
  const action = z
    .enum(["save", "publish", "restore"])
    .safeParse(form.get("operation"));
  if (!version.success || !action.success) return { notice: "invalid" };
  let document: unknown = null;
  if (action.data === "save") {
    const raw = form.get("document");
    if (typeof raw !== "string" || raw.length > 30000)
      return { notice: "invalid" };
    try {
      document = JSON.parse(raw);
    } catch {
      return { notice: "invalid" };
    }
  } else if (action.data === "restore") {
    const restore = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(form.get("restore"));
    if (!restore.success) return { notice: "invalid" };
    const { data, error } = await session.client
      .from("pricing_revisions")
      .select("document")
      .eq("revision", restore.data)
      .single();
    if (error) return { notice: "error" };
    document = data.document;
  }
  if (action.data !== "publish" && !pricingSchema.safeParse(document).success)
    return { notice: "invalid" };
  const { error } = await session.client.rpc("admin_pricing_change", {
    p_action: action.data === "publish" ? "publish" : "save",
    p_document: document,
    p_expected: version.data,
  });
  if (error) return { notice: error.code === "40001" ? "conflict" : "error" };
  redirect(
    `/${locale}/admin/plans?notice=${action.data === "publish" ? "published" : "saved"}`,
  );
}

export async function assignPlan(form: FormData) {
  const locale = z.enum(locales).parse(form.get("locale"));
  const session = await requireAdminSession(locale);
  if (!session) redirect(`/${locale}/admin`);
  const date = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00Z`
      : null;
  };
  const input = assignmentSchema.safeParse({
    owner: form.get("owner"),
    version: Number(form.get("version")),
    plan_version: form.get("plan_version"),
    state: form.get("state"),
    valid_until: date("valid_until"),
    effective_at: date("effective_at"),
    bonus_until: date("bonus_until"),
    reason: form.get("reason"),
    bonuses: {
      photos: Number(form.get("photos")),
      storage_bytes: Number(form.get("storage_gb")) * 1e9,
      active_events: Number(form.get("active_events")),
      searches: Number(form.get("searches")),
      delivery_bytes: Number(form.get("delivery_gb")) * 1e9,
    },
  });
  if (!input.success) redirect(`/${locale}/admin/accounts?notice=invalid`);
  const v = input.data;
  const { error } = await session!.client.rpc("admin_assign_plan", {
    p_owner: v.owner,
    p_expected: v.version,
    p_plan: v.plan_version,
    p_state: v.state,
    p_valid_until: v.valid_until,
    p_effective_at: v.effective_at,
    p_bonuses: v.bonuses,
    p_bonus_until: v.bonus_until,
    p_reason: v.reason,
  });
  redirect(
    `/${locale}/admin/accounts?owner=${v.owner}&notice=${error ? (error.code === "40001" ? "conflict" : "error") : "saved"}`,
  );
}
