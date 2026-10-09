import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { getSiteContent } from "@/lib/site/server";
import { getPricing } from "@/lib/billing/server";
export default async function Contact({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const c = await getSiteContent(locale);
  const query = await searchParams;
  const pricing = query.plan ? await getPricing() : null;
  const plan = pricing?.visible ? pricing.plans.find(p => p.visible && p.code === query.plan) : undefined;
  const m = messages[locale].modern;
  return (
    <article className="legal-page">
      <span className="eyebrow">SnapMatch</span>
      <h1>{m.contactTitle}</h1>
      <p className="intro">{m.contactIntro}</p>
      {plan && <p className="notice">{messages[locale].billing.planEnquiry.replace("{plan}", plan.name)}</p>}
      <div className="contact-details">
        {c.company.legalName && <h2>{c.company.legalName}</h2>}
        {c.company.email && (
          <a href={`mailto:${c.company.email}${plan ? `?subject=${encodeURIComponent(`SnapMatch — ${plan.name}`)}` : ""}`}>{c.company.email}</a>
        )}
        {c.company.phone && (
          <a href={`tel:${c.company.phone.replace(/[^+\d]/g, "")}`}>
            {c.company.phone}
          </a>
        )}
        {c.company.address && <p>{c.company.address}</p>}
        {!c.company.email && !c.company.phone && !c.company.address && (
          <p>{m.supportPlaceholder}</p>
        )}
      </div>
      <Link href={`/${locale}`} className="quiet-link">
        {messages[locale].landing.home} →
      </Link>
    </article>
  );
}
