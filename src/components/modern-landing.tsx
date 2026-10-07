import Link from "next/link";
import { messages, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/lib/site/schema";
import { ScrollEffects } from "./scroll-effects";
import { Icon } from "./icon";

export function ModernLanding({
  locale,
  content: c,
}: {
  locale: Locale;
  content: SiteContent;
}) {
  const m = messages[locale].modern;
  const learnTarget = c.sections.how
    ? "#how-it-works"
    : c.sections.studio
      ? "#photographers"
      : c.sections.privacy
        ? "#privacy"
        : c.sections.faq
          ? "#questions"
          : "#contact";
  const occasions = [
    m.corporateLabel,
    m.concertLabel,
    m.birthdayLabel,
    m.weddingLabel,
    m.graduationLabel,
    m.familyLabel,
  ];
  const sections = {
    how: (
      <section
        key="how"
        id="how-it-works"
        className="landing-section landing-how"
      >
        <div className="landing-section-head" data-reveal>
          <span className="landing-kicker">{c.walkthrough.kicker}</span>
          <h2>{c.walkthrough.title}</h2>
          <p>{c.walkthrough.description}</p>
          <span className="landing-small-note">{m.guestAvailability}</span>
        </div>
        <ol className="landing-steps">
          {c.walkthrough.steps.map((step, i) => (
            <li key={i} data-reveal>
              <span className="landing-step-number" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
              <span className="landing-step-arrow" aria-hidden="true">
                ↗
              </span>
            </li>
          ))}
        </ol>
      </section>
    ),
    studio: (
      <section key="studio" id="photographers" className="landing-studio">
        <div className="landing-section">
          <div className="landing-studio-heading" data-reveal>
            <span className="landing-kicker">{c.studio.kicker}</span>
            <h2>{c.studio.title}</h2>
            <p>{c.studio.description}</p>
          </div>
          <dl className="landing-studio-features">
            {c.studio.features.map((feature, i) => (
              <div key={i} data-reveal>
                <span className="landing-feature-index" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <dt>{feature.title}</dt>
                <dd>{feature.body}</dd>
              </div>
            ))}
          </dl>
          <div className="landing-studio-footnote">
            <span>{m.studioFootnote}</span>
            <span aria-hidden="true">↗</span>
          </div>
        </div>
      </section>
    ),
    privacy: (
      <section
        key="privacy"
        id="privacy"
        className="landing-section landing-privacy"
      >
        <div className="landing-section-head" data-reveal>
          <span className="landing-kicker">{c.privacy.kicker}</span>
          <h2>{c.privacy.title}</h2>
          <p>{c.privacy.description}</p>
          <Link className="landing-text-link" href={`/${locale}/privacy`}>
            {c.privacy.linkLabel}
            <Icon name="arrow" size={18} />
          </Link>
        </div>
        <div className="landing-privacy-list">
          {c.privacy.items.map((item, i) => (
            <article key={i} data-reveal>
              <Icon name="check" size={18} />
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    ),
    faq: (
      <section key="faq" id="questions" className="landing-section landing-faq">
        <div className="landing-section-head" data-reveal>
          <span className="landing-kicker">{c.navigation.faq}</span>
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
    <div className="crafted-landing">
      <ScrollEffects />
      <section className="landing-section landing-hero">
        <div className="landing-hero-topline">
          <span className="landing-kicker">{c.hero.badge}</span>
          <span className="landing-edition">{m.madeIn}</span>
        </div>
        <h1>
          {c.hero.title}
          <span>{c.hero.accent}</span>
        </h1>
        <div className="landing-hero-bottom">
          <div>
            <p className="landing-hero-description">{c.hero.description}</p>
            <p className="landing-availability">
              <span aria-hidden="true" />
              {c.hero.notice}
            </p>
          </div>
          <a className="landing-explore" href={learnTarget}>
            <span>{c.hero.secondary}</span>
            <span className="landing-explore-arrow" aria-hidden="true">
              ↓
            </span>
          </a>
        </div>
        <div className="landing-hero-rule" aria-hidden="true">
          <span />
        </div>
      </section>
      <section className="landing-occasions" aria-label={m.eventTypes}>
        <div>
          <span className="landing-kicker">{m.eventTypes}</span>
          <ul>
            {occasions.map((occasion) => (
              <li key={occasion}>{occasion}</li>
            ))}
          </ul>
        </div>
      </section>
      {c.sections.order
        .filter((key) => c.sections[key])
        .map((key) => sections[key])}
      <section className="landing-closing" id="contact">
        <div className="landing-section" data-reveal>
          <div>
            <span className="landing-kicker">{m.closingKicker}</span>
            <h2>{c.closing.title}</h2>
            <p>{c.closing.description}</p>
          </div>
          <Link className="landing-contact-link" href={`/${locale}/contact`}>
            {c.closing.button}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
