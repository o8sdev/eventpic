"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { locales } from "@/lib/i18n";
import sharp from "sharp";
import { authNotice } from "@/lib/auth-notice";
import { passwordSignInSchema } from "@/lib/auth-schema";
const localeSchema = z.enum(locales);
export async function signInWithPassword(form: FormData) {
  const locale = localeSchema.parse(form.get("locale"));
  const input = passwordSignInSchema.safeParse(Object.fromEntries(form));
  if (!input.success) redirect(`/${locale}/login?notice=credentials`);
  if (!isConfigured()) redirect(`/${locale}/login`);
  const client = await createClient();
  const { error } = await client.auth.signInWithPassword(input.data);
  // Do not distinguish a missing email from a wrong password.
  if (error)
    redirect(
      `/${locale}/login?notice=${error.code === "over_request_rate_limit" ? "authRateLimit" : "credentials"}`,
    );
  const { data: admin } = await client.rpc("is_system_admin");
  redirect(`/${locale}/${admin === true ? "admin" : "dashboard"}`);
}
export async function signIn(form: FormData) {
  const locale = localeSchema.parse(form.get("locale"));
  const email = z.email().max(254).safeParse(form.get("email"));
  if (!email.success) redirect(`/${locale}/login?notice=invalid`);
  if (!isConfigured()) redirect(`/${locale}/login`);
  const origin = z.url().parse(process.env.SITE_URL);
  const client = await createClient();
  const { error } = await client.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: new URL(
        `/auth/confirm?locale=${locale}`,
        origin,
      ).toString(),
    },
  });
  redirect(
    `/${locale}/login?notice=${error ? authNotice(error.code) : "sent"}`,
  );
}
export async function signOut(form: FormData) {
  const locale = localeSchema.parse(form.get("locale"));
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) redirect(`/${locale}/dashboard?notice=loadError`);
  redirect(`/${locale}/login`);
}
export async function saveProfile(form: FormData) {
  const locale = localeSchema.parse(form.get("locale"));
  const data = z
    .object({
      full_name: z.string().trim().min(1).max(120),
      business_name: z.string().trim().max(160),
      phone: z
        .string()
        .trim()
        .max(32)
        .regex(/^[+\d\s().-]*$/),
    })
    .safeParse(Object.fromEntries(form));
  if (!data.success) redirect(`/${locale}/dashboard/profile?notice=invalid`);
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const { error } = await client
    .from("profiles")
    .update(data.data)
    .eq("id", user.id);
  redirect(
    `/${locale}/dashboard/profile?notice=${error ? "saveError" : "saved"}`,
  );
}
export async function saveLogo(form: FormData) {
  const locale = localeSchema.parse(form.get("locale"));
  const logo = z
    .file()
    .min(1)
    .max(2 * 1024 * 1024)
    .mime(["image/jpeg", "image/png"])
    .safeParse(form.get("logo"));
  if (!logo.success) redirect(`/${locale}/dashboard/profile?notice=invalid`);
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  let image: Buffer;
  try {
    // Decode untrusted files with a pixel limit, resize and re-encode; never retain metadata.
    image = await sharp(Buffer.from(await logo.data.arrayBuffer()), {
      limitInputPixels: 16_000_000,
      animated: false,
    })
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    redirect(`/${locale}/dashboard/profile?notice=invalid`);
  }
  const path = `${user.id}/logo.png`;
  const { error } = await client.storage
    .from("branding")
    .upload(path, image, { contentType: "image/png", upsert: true });
  if (error) redirect(`/${locale}/dashboard/profile?notice=saveError`);
  const { error: profileError } = await client
    .from("profiles")
    .update({ logo_path: path })
    .eq("id", user.id);
  redirect(
    `/${locale}/dashboard/profile?notice=${profileError ? "saveError" : "saved"}`,
  );
}
