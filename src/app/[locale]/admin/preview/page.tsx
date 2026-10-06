import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/site/server";
import { defaultSiteContent, withSiteDefaults } from "@/lib/site/defaults";
import { siteContentSchema } from "@/lib/site/schema";
import { SiteChrome } from "@/components/site-chrome";
import { ModernLanding } from "@/components/modern-landing";
import { LegalPage } from "@/components/legal-page";
export default async function Preview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const session = await requireAdminSession(locale);
  if (!session) return null;
  const { client } = session;
  const { data } = await client
    .from("site_content")
    .select("draft")
    .eq("locale", locale)
    .single();
  const parsed = siteContentSchema.safeParse(data?.draft);
  const c = parsed.success
    ? withSiteDefaults(locale, parsed.data)
    : defaultSiteContent(locale);
  const m = messages[locale].modern;
  return (
    <>
      <div className="preview-banner">
        <span>{m.previewBanner}</span>
        <Link href={`/${locale}/admin/edit`}>{m.backEditor} →</Link>
      </div>
      <SiteChrome locale={locale} content={c} preview>
        <ModernLanding locale={locale} content={c} />
        <LegalPage locale={locale} content={c} kind="privacy" />
        <LegalPage locale={locale} content={c} kind="terms" />
      </SiteChrome>
    </>
  );
}
