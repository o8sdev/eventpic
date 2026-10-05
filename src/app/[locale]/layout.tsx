import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Brand } from "@/components/brand";
export const metadata = { title: "SnapMatch" };
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
          <Brand name={t.brand} />
        </Link>
        <nav className="marketing-nav" aria-label={t.brand}>
          <Link href={`/${locale}#how-it-works`}>{t.landing.navHow}</Link>
          <Link href={`/${locale}#photographers`}>{t.landing.navStudio}</Link>
          <Link href={`/${locale}#questions`}>{t.landing.navFaq}</Link>
        </nav>
        <div className="header-actions">
          <LanguageSwitcher label={t.language} />
          <Link className="header-login" href={`/${locale}/login`}>
            {t.login}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div>
          <Brand name={t.brand} />
          <p>{t.landing.footer}</p>
        </div>
        <Link href={`/${locale}/privacy`}>{t.privacy}</Link>
      </footer>
    </>
  );
}
