import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
export default async function Privacy({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages[locale];
  return (
    <article className="privacy">
      <p className="eyebrow">{t.privacy}</p>
      <h1>{t.privacyTitle}</h1>
      <p className="notice">{t.privacyDraft}</p>
      <p className="intro">{t.privacyBody}</p>
    </article>
  );
}
