import Link from "next/link";
import { messages, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/lib/site/schema";
import { ProductDemo, StudioDemo, Walkthrough } from "./product-demo";
import { ScrollEffects } from "./scroll-effects";
import { Icon } from "./icon";
import { ExampleGallery } from "./example-gallery";

export function ModernLanding({
  locale,
  content: c,
}: {
  locale: Locale;
  content: SiteContent;
}) {
  const m = messages[locale].modern;
  const sections = {
    how: (
      <section
        key="how"
        id="how-it-works"
        className="modern-section walkthrough-section"
      >
        <div className="section-heading" data-reveal>
          <span className="eyebrow">{c.walkthrough.kicker}</span>
          <h2>{c.walkthrough.title}</h2>
          <p>{c.walkthrough.description}</p>
        </div>
        <Walkthrough locale={locale} content={c} />
      </section>
    ),
    studio: (
      <section
        key="studio"
        id="photographers"
        className="modern-section studio-section"
      >
        <div className="studio-copy" data-reveal>
          <span className="eyebrow">{c.studio.kicker}</span>
          <h2>{c.studio.title}</h2>
          <p className="section-description">{c.studio.description}</p>
          <div className="benefits">
            {c.studio.features.map((f, i) => (
              <div key={i}>
                <span>
                  <Icon name="check" size={16} />
                </span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
          <Link className="button" href={`/${locale}/login`}>
            {c.hero.primary}
            <Icon name="arrow" size={18} />
          </Link>
        </div>
        <div data-reveal className="studio-showcase">
          <StudioDemo locale={locale} content={c} />
          <span className="showcase-note">
            <Icon name="spark" size={15} />
            {m.demoNote}
          </span>
        </div>
      </section>
    ),
    privacy: (
      <section key="privacy" id="privacy" className="privacy-section">
        <div className="modern-section">
          <div className="privacy-intro" data-reveal>
            <div>
              <span className="eyebrow">{c.privacy.kicker}</span>
              <h2>{c.privacy.title}</h2>
            </div>
            <div>
              <p>{c.privacy.description}</p>
              <Link className="quiet-link" href={`/${locale}/privacy`}>
                {c.privacy.linkLabel}
                <Icon name="arrow" size={17} />
              </Link>
            </div>
          </div>
          <div className="privacy-grid">
            {c.privacy.items.map((p, i) => (
              <article key={i} data-reveal>
                <span className="privacy-icon">
                  <Icon
                    name={["shield", "scan", "lock", "check"][i % 4]}
                    size={23}
                  />
                </span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),
    faq: (
      <section key="faq" id="questions" className="modern-section faq-section">
        <div data-reveal>
          <span className="eyebrow">{c.navigation.faq}</span>
          <h2>{c.faqs.title}</h2>
        </div>
        <div className="faq-list" data-reveal>
          {c.faqs.items.map((item, i) => (
            <details key={i}>
              <summary>
                {item.question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    ),
  };
  return (
    <div className="modern-landing">
      <ScrollEffects />
      <section className="modern-hero">
        <div className="hero-glow" />
        <div className="hero-copy">
          <span className="hero-badge">
            <span />
            {c.hero.badge}
          </span>
          <h1>
            {c.hero.title}
            <br />
            <span>{c.hero.accent}</span>
          </h1>
          <p className="hero-description">{c.hero.description}</p>
          <div className="hero-actions">
            <Link className="button" href={`/${locale}/login`}>
              {c.hero.primary}
              <Icon name="arrow" size={18} />
            </Link>
            <a
              className="button button-secondary"
              href={c.sections.how ? "#how-it-works" : "#product-demo"}
            >
              {c.hero.secondary}
              <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="availability-note">
            <span />
            {c.hero.notice}
          </p>
          <div className="hero-small-features">
            <span>
              <Icon name="shield" size={14} />
              {m.consent}
            </span>
            <span>AZ · RU · EN</span>
          </div>
        </div>
        <div id="product-demo">
          <ProductDemo locale={locale} content={c} />
        </div>
        <a
          className="scroll-cue"
          href={c.sections.how ? "#how-it-works" : "#product-demo"}
        >
          {m.explore}
          <span aria-hidden="true">↓</span>
        </a>
      </section>
      <section className="feature-ribbon">
        <p>{m.builtFor}</p>
        <div>
          <span>
            <Icon name="image" />
            {m.featureOne}
          </span>
          <span>
            <Icon name="scan" />
            {m.featureTwo}
          </span>
          <span>
            <Icon name="spark" />
            {m.featureThree}
          </span>
        </div>
      </section>
      {c.walkthrough.showExamples !== false && (
        <ExampleGallery locale={locale} content={c} />
      )}
      {c.sections.order
        .filter((key) => c.sections[key])
        .map((key) => sections[key])}
      <section className="modern-cta" data-reveal>
        <div className="cta-orb" />
        <span className="eyebrow">SnapMatch</span>
        <h2>{c.closing.title}</h2>
        <p>{c.closing.description}</p>
        <Link className="button" href={`/${locale}/login`}>
          {c.closing.button}
          <Icon name="arrow" size={18} />
        </Link>
      </section>
    </div>
  );
}
