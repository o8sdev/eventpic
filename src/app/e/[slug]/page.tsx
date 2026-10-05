import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { locales, messages } from "@/lib/i18n";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
export const metadata = { title:"SnapMatch", robots: { index: false, follow: false } };
// Phase 2 QR destination. It never queries private events or starts camera access.
// Phase 4 replaces this preparation screen with the consent/session flow.
export default async function Preparation({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { slug } = await params;
  if (
    !z
      .string()
      .regex(/^[a-zA-Z0-9_-]{8,64}$/)
      .safeParse(slug).success
  )
    notFound();
  const query = await searchParams;
  const locale = z.enum(locales).catch("az").parse(query.locale);
  const t = messages[locale].phase2;
  return (
    <div className="guest-preparation">
      <header>
        <Link href={`/${locale}`}>
          <Brand name="SnapMatch" />
        </Link>
        <nav aria-label={messages[locale].language}>
          {locales.map((value) => (
            <a
              key={value}
              href={`?locale=${value}`}
              aria-current={value === locale ? "page" : undefined}
            >
              {value.toUpperCase()}
            </a>
          ))}
        </nav>
      </header>
      <main>
        <span className="guest-icon">
          <Icon name="image" size={38} />
        </span>
        <h1>{t.guestPreparation}</h1>
        <p>{t.guestPreparationBody}</p>
        <Link className="quiet-link" href={`/${locale}`}>
          {t.home} →
        </Link>
      </main>
    </div>
  );
}
