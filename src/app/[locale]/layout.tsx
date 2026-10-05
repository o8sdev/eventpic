import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
export const metadata = { title: "FaceFind" };
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages[locale];
  return (
    <>
      <header className="site-header">
        <Link className="brand" href={`/${locale}`}>
          <span className="brand-mark" aria-hidden="true">
            ✧
          </span>
          {t.brand}
        </Link>
        <LanguageSwitcher label={t.language} />
      </header>
      <main>{children}</main>
      <footer>
        <span>{t.brand}</span>
        <Link href={`/${locale}/privacy`}>{t.privacy}</Link>
      </footer>
    </>
  );
}
