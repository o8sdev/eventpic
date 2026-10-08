import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { saveProfile, saveLogo } from "../../actions";
import { SubmitButton } from "@/components/submit-button";
export default async function Profile({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!isConfigured()) redirect(`/${locale}/login`);
  const t = messages[locale];
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const { data: profile, error } = await client
    .from("profiles")
    .select("full_name,business_name,phone,logo_path")
    .eq("id", user.id)
    .single();
  const signed = profile?.logo_path
    ? await client.storage
        .from("branding")
        .createSignedUrl(profile.logo_path, 3600)
    : null;
  const { notice } = await searchParams;
  return (
    <>
      <Link className="muted" href={`/${locale}/dashboard`}>
        ← {t.back}
      </Link>
      <h1>{t.profile}</h1>
      {error ? (
        <p role="alert">{t.loadError}</p>
      ) : (
        <>
          <form className="card profile-form" action={saveProfile}>
            <input name="locale" type="hidden" value={locale} />
            {(
              [
                { name: "full_name", label: t.name, max: 120, auto: "name" },
                {
                  name: "business_name",
                  label: t.business,
                  max: 160,
                  auto: "organization",
                },
                { name: "phone", label: t.phone, max: 32, auto: "tel" },
              ] as const
            ).map((field) => (
              <div key={field.name}>
                <label htmlFor={field.name}>{field.label}</label>
                <input
                  id={field.name}
                  name={field.name}
                  type={field.name === "phone" ? "tel" : "text"}
                  autoComplete={field.auto}
                  maxLength={field.max}
                  required={field.name === "full_name"}
                  defaultValue={profile?.[field.name] || ""}
                />
              </div>
            ))}
            <SubmitButton label={t.save} pending={t.saving} />
            {notice && (
              <p role="status">
                {notice === "saved"
                  ? t.saved
                  : notice === "invalid"
                    ? t.invalid
                    : t.saveError}
              </p>
            )}
          </form>
          <form action={saveLogo} className="card profile-form mt-6">
            <input name="locale" type="hidden" value={locale} />
            <label htmlFor="logo">{t.logo}</label>
            {signed?.data?.signedUrl && (
              <Image
                unoptimized
                src={signed.data.signedUrl}
                width={120}
                height={120}
                style={{ objectFit: "contain" }}
                alt={t.logo}
              />
            )}
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg"
              required
            />
            <p className="muted">{t.logoHint}</p>
            <SubmitButton label={t.saveLogo} pending={t.saving} />
          </form>
        </>
      )}
    </>
  );
}
