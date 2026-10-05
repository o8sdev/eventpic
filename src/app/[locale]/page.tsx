import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
function StepIcon({ type }: { type: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === "qr" ? (
        <>
          <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6z" />
          <path d="M18 12h3M12 3v3M12 12v3M3 12h3" />
        </>
      ) : type === "face" ? (
        <>
          <path d="M7 3H3v4M17 3h4v4M3 17v4h4M21 17v4h-4" />
          <circle cx="12" cy="11" r="5" />
          <path d="M8 18c2-2 6-2 8 0M10 12c1 1 3 1 4 0" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="m3 17 5-5 4 4 4-6 5 7" />
        </>
      )}
    </svg>
  );
}
export default async function Landing({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages[locale].landing;
  return (
    <div className="editorial">
      <section className="editorial-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-line" />
            {t.eyebrow}
          </p>
          <h1>
            {t.title}
            <br />
            <em>{t.titleAccent}</em>
          </h1>
          <p className="hero-description">{t.description}</p>
          <div className="hero-actions">
            <Link className="button" href={`/${locale}/login`}>
              {t.primary}
              <span aria-hidden="true">↗</span>
            </Link>
            <a className="quiet-link" href="#how-it-works">
              {t.secondary}
              <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="launch-note">
            <span aria-hidden="true" />
            {t.note}
          </p>
        </div>
        <div className="hero-visual">
          <div className="photo-frame">
            <Image
              src="/images/wedding-editorial.png"
              alt={t.imageAlt}
              fill
              priority
              sizes="(max-width: 760px) 100vw, 55vw"
            />
            <div className="photo-shade" />
            <p className="photo-caption">{t.caption}</p>
          </div>
          <div className="memory-card">
            <span className="memory-mark" aria-hidden="true">
              ✧
            </span>
            <div>
              <small>{t.demo}</small>
              <strong>{t.phoneSubtitle}</strong>
            </div>
            <span className="memory-check" aria-hidden="true">
              ✓
            </span>
          </div>
          <span className="vertical-caption" aria-hidden="true">
            SNAPMATCH — BAKU
          </span>
        </div>
      </section>
      <div className="promise-strip">
        {t.strip.map((item) => (
          <span key={item}>
            <span aria-hidden="true">✧</span>
            {item}
          </span>
        ))}
      </div>
      <section id="how-it-works" className="section-wrap how-section">
        <div className="section-heading">
          <p className="eyebrow">{t.howEyebrow}</p>
          <h2>{t.howTitle}</h2>
          <p className="muted">{t.howDescription}</p>
        </div>
        <div className="steps">
          {t.steps.map((step, i) => (
            <article className="step" key={step.title}>
              <div className="step-top">
                <span className="step-icon">
                  <StepIcon type={step.icon} />
                </span>
                <span className="step-number">0{i + 1}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="photographers" className="studio-section section-wrap">
        <div className="gallery-preview">
          <div className="gallery-label">
            <span>{t.demo}</span>
            <span aria-hidden="true">✧</span>
          </div>
          <div className="gallery-sheet">
            <div className="gallery-heading">
              <span className="eyebrow">{t.sampleLabel}</span>
              <h3>{t.sampleEvent}</h3>
            </div>
            <div className="gallery-photo">
              <Image
                src="/images/wedding-editorial.png"
                alt={t.imageAlt}
                fill
                sizes="(max-width: 760px) 90vw, 40vw"
              />
            </div>
            <div className="gallery-footer">
              <span>{t.phoneTitle}</span>
              <span aria-hidden="true">♡</span>
            </div>
          </div>
          <p className="sample-caption">{t.sampleCaption}</p>
        </div>
        <div className="studio-copy">
          <p className="eyebrow">{t.studioEyebrow}</p>
          <h2>{t.studioTitle}</h2>
          <p className="muted">{t.studioBody}</p>
          <div className="benefits">
            {t.benefits.map((item) => (
              <div key={item.title}>
                <span aria-hidden="true">✓</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
          <Link className="quiet-link" href={`/${locale}/login`}>
            {t.studioCta}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <section className="privacy-band">
        <div className="section-wrap">
          <div className="privacy-intro">
            <div>
              <p className="eyebrow">{t.privacyEyebrow}</p>
              <h2>{t.privacyTitle}</h2>
            </div>
            <p>{t.privacyBody}</p>
          </div>
          <div className="privacy-pillars">
            {t.privacyItems.map((item, i) => (
              <article key={item.title}>
                <span className="pillar-number">0{i + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <Link className="quiet-link" href={`/${locale}/privacy`}>
            {t.privacyLink}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <section id="questions" className="section-wrap faq-section">
        <div>
          <p className="eyebrow">{t.navFaq}</p>
          <h2>{t.faqTitle}</h2>
        </div>
        <div className="faq-list">
          {t.faqs.map((faq) => (
            <details key={faq.q}>
              <summary>
                {faq.q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="closing-section">
        <span className="closing-flower" aria-hidden="true">
          ✧
        </span>
        <p className="eyebrow">{t.closingEyebrow}</p>
        <h2>{t.closingTitle}</h2>
        <p className="muted">{t.closingBody}</p>
        <Link className="button" href={`/${locale}/login`}>
          {t.primary}
          <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </div>
  );
}
