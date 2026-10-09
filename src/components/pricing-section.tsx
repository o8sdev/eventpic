import Link from "next/link";
import { messages, type Locale } from "@/lib/i18n";
import { formatGB, formatPrice, type Pricing } from "@/lib/billing/schema";

export function PricingSection({
  pricing,
  locale,
}: {
  pricing: Pricing;
  locale: Locale;
}) {
  if (!pricing.visible) return null;
  const t = messages[locale].billing;
  return (
    <section id="pricing" className="landing-section landing-pricing">
      <div className="landing-section-head" data-reveal>
        <span className="landing-kicker">{t.pricing}</span>
        <h2>{pricing.heading}</h2>
        <p>{pricing.description}</p>
      </div>
      <div className="pricing-grid">
        {pricing.plans
          .filter((p) => p.visible)
          .map((plan) => (
            <article
              key={plan.code}
              className={`pricing-card${plan.featured ? " pricing-featured" : ""}`}
              data-reveal
            >
              <div className="pricing-card-top">
                <h3>{plan.name}</h3>
                {plan.featured && <span>{t.recommended}</span>}
              </div>
              <p className="pricing-description">{plan.description}</p>
              <p className="pricing-amount">
                <strong>{formatPrice(plan.price_minor)}</strong>
                <span>
                  AZN
                  <br />
                  {t.perMonth}
                </span>
              </p>
              <dl className="pricing-limits">
                <div>
                  <dt>{t.photos}</dt>
                  <dd>{plan.photos.toLocaleString("en")}</dd>
                </div>
                <div>
                  <dt>{t.storage}</dt>
                  <dd>{formatGB(plan.storage_bytes)} GB</dd>
                </div>
                <div>
                  <dt>{t.events}</dt>
                  <dd>{plan.active_events}</dd>
                </div>
              </dl>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>
                    <span aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                className="pricing-cta"
                href={`/${locale}/contact?plan=${encodeURIComponent(plan.code)}`}
              >
                {pricing.cta}
                <span aria-hidden="true">↗</span>
              </Link>
              <details>
                <summary>{t.allowances}</summary>
                <p>
                  {plan.searches.toLocaleString("en")} {t.searchAllowance}
                  <br />
                  {formatGB(plan.delivery_bytes)} GB {t.deliveryAllowance}
                </p>
              </details>
            </article>
          ))}
      </div>
      <p className="pricing-note">{pricing.note}</p>
    </section>
  );
}
