import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getSiteContent } from "@/lib/site/server";
import { ModernLanding } from "@/components/modern-landing";
export default async function Landing({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const content = await getSiteContent(locale);
  return <ModernLanding locale={locale} content={content} />;
}
