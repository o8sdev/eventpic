import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getSiteContent } from "@/lib/site/server";
import { ModernLanding } from "@/components/modern-landing";
import { getPricing } from "@/lib/billing/server";
export default async function Landing({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [content, pricing] = await Promise.all([
    getSiteContent(locale),
    getPricing(),
  ]);
  return <ModernLanding locale={locale} content={content} pricing={pricing} />;
}
