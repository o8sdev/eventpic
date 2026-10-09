import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/lib/i18n";
import { getSiteContent } from "@/lib/site/server";
import { SiteChrome } from "@/components/site-chrome";
import { getPricing } from "@/lib/billing/server";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const c = await getSiteContent(locale);
  return {
    title: c.seo.title,
    description: c.seo.description,
    metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
    icons: { icon: c.branding.iconPath },
    openGraph: {
      title: c.seo.title,
      description: c.seo.description,
      images: [c.seo.image],
    },
  };
}
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [content, pricing] = await Promise.all([
    getSiteContent(locale),
    getPricing(),
  ]);
  return (
    <SiteChrome
      locale={locale}
      content={content}
      pricingVisible={Boolean(pricing?.visible)}
    >
      {children}
    </SiteChrome>
  );
}
