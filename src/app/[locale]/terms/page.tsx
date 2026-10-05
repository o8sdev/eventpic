import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getSiteContent } from "@/lib/site/server";
import { LegalPage } from "@/components/legal-page";
export default async function Terms({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <LegalPage
      locale={locale}
      content={await getSiteContent(locale)}
      kind="terms"
    />
  );
}
