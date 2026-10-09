"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { locales } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/site/server";
import { createAdminClient, adminClientConfigured } from "@/lib/supabase/admin";
import { photographerAccountSchema } from "@/lib/auth-schema";

export async function createPhotographer(form: FormData) {
  const locale = z.enum(locales).parse(form.get("locale"));
  // Authorize with the caller's verified session before constructing the RLS-bypassing client.
  const session = await requireAdminSession(locale);
  if (!session || !adminClientConfigured())
    redirect(`/${locale}/admin/accounts?notice=accountSetup`);
  const input = photographerAccountSchema.safeParse(Object.fromEntries(form));
  if (!input.success)
    redirect(`/${locale}/admin/accounts?notice=accountInvalid`);
  const service = createAdminClient();
  const operation = randomUUID();
  const { error: auditError } = await service.from("admin_audit_log").insert({
    actor_id: session.user.id,
    action: "photographer_creation_requested",
    metadata: { operation },
  });
  // A failed audit write must not silently create an untracked account.
  if (auditError) redirect(`/${locale}/admin/accounts?notice=accountError`);
  const { email, password, full_name, business_name } = input.data;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Names are display metadata, never authorization claims. There is no role input.
    user_metadata: { full_name, business_name },
  });
  if (error || !data.user) {
    await service.from("admin_audit_log").insert({
      actor_id: session.user.id,
      action: "photographer_creation_failed",
      metadata: { operation, code: error?.code ?? "unknown" },
    });
    redirect(
      `/${locale}/admin/accounts?notice=${error?.code === "email_exists" || error?.code === "user_already_exists" ? "accountExists" : "accountError"}`,
    );
  }
  const id = data.user.id;
  const profile = await service
    .from("profiles")
    .update({ full_name, business_name })
    .eq("id", id);
  const audit = await service.from("admin_audit_log").insert({
    actor_id: session.user.id,
    action: "photographer_created",
    metadata: {
      operation,
      photographer_id: id,
      email_confirmation: "admin_provisioned",
    },
  });
  // Auth and Postgres are separate transactions. Report a partial follow-up
  // failure explicitly; never overwrite an existing password on a repeated submit.
  redirect(
    `/${locale}/admin/accounts?owner=${id}&notice=${profile.error || audit.error ? "accountCreatedWarning" : "accountCreated"}`,
  );
}
