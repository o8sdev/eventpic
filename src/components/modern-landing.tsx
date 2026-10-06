import Image from "next/image";
import Link from "next/link";
import { messages, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/lib/site/schema";
import { guestPreviewPhotos } from "@/lib/site/photos";
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
  const photos = c.branding.examplePhotos || [];
  const hero = photos.find((photo) => photo.image === c.branding.heroImage);
  const supporting =
    photos.find(
      (photo) =>
        photo.image === "/images/event-concert.webp" &&
        photo.image !== c.branding.heroImage,
    ) || photos.find((photo) => photo.image !== c.branding.heroImage);
  const studioPhoto = photos[1] || hero;
  const guestPhoto = guestPreviewPhotos(c)[0];
  const learnTarget = c.sections.how
    ? "#how-it-works"
    : c.walkthrough.showExamples !== false
      ? "#event-examples"
      : "#top";
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
        </div>
        <div className="landing-how-body">
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
              </li>
            ))}
          </ol>
          {guestPhoto && (
            <figure className="landing-guest-preview" data-reveal>
              <div className="landing-preview-heading">
                <Image
                  src={c.branding.iconPath}
                  width={30}
                  height={30}
                  alt=""
                />
                <span>{m.galleryTitle}</span>
                <Icon name="lock" size={17} />
              </div>
              <div className="landing-preview-photo">
                <Image
                  src={guestPhoto.image}
                  alt={guestPhoto.alt}
                  fill
                  sizes="(max-width: 760px) 90vw, 40vw"
                />
              </div>
              <figcaption>
                <span>{m.matchedLabel}</span>
                <span>{m.demoNote}</span>
              </figcaption>
            </figure>
          )}
        </div>
      </section>
    ),
    studio: (
      <section key="studio" id="photographers" className="landing-studio">
        <div className="landing-section landing-studio-inner">
          <div data-reveal>
            <span className="landing-kicker">{c.studio.kicker}</span>
            <h2>{c.studio.title}</h2>
            <p className="landing-intro">{c.studio.description}</p>
            <Link
              className="landing-button landing-button-light"
              href={`/${locale}/login`}
            >
              {c.hero.primary}
              <Icon name="arrow" size={19} />
            </Link>
            <dl className="landing-studio-features">
              {c.studio.features.map((feature, i) => (
                <div key={i}>
                  <dt>{feature.title}</dt>
                  <dd>{feature.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          {studioPhoto && (
            <figure className="landing-studio-photo" data-reveal>
              <div>
                <Image
                  src={studioPhoto.image}
                  alt={studioPhoto.alt}
                  fill
                  sizes="(max-width: 760px) 90vw, 45vw"
                />
              </div>
              <figcaption>
                <span>{studioPhoto.label || m.photos}</span>
                <span>SnapMatch</span>
              </figcaption>
            </figure>
          )}
        </div>
      </section>
    ),
    privacy: (
      <section
        key="privacy"
        id="privacy"
        className="landing-section landing-privacy"
      >
        <div data-reveal>
          <span className="landing-kicker">{c.privacy.kicker}</span>
          <h2>{c.privacy.title}</h2>
          <p className="landing-intro">{c.privacy.description}</p>
          <Link className="landing-text-link" href={`/${locale}/privacy`}>
            {c.privacy.linkLabel}
            <Icon name="arrow" size={18} />
          </Link>
        </div>
        <div className="landing-privacy-list">
          {c.privacy.items.map((item, i) => (
            <article key={i} data-reveal>
              <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    ),
    faq: (
      <section key="faq" id="questions" className="landing-section landing-faq">
        <div data-reveal>
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
        <div className="landing-hero-copy">
          <span className="landing-kicker">{c.hero.badge}</span>
          <h1>
            {c.hero.title}
            <span>{c.hero.accent}</span>
          </h1>
          <p className="landing-hero-description">{c.hero.description}</p>
          <div className="landing-hero-actions">
            <Link className="landing-button" href={`/${locale}/login`}>
              {c.hero.primary}
              <Icon name="arrow" size={20} />
            </Link>
            <a className="landing-text-link" href={learnTarget}>
              {c.hero.secondary}
              <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="landing-availability">{c.hero.notice}</p>
        </div>
        <div className="landing-hero-photos">
          <figure className="landing-photo-main">
            <div>
              <Image
                src={c.branding.heroImage}
                alt={c.branding.imageAlt}
                fill
                priority
                sizes="(max-width: 760px) 75vw, 40vw"
              />
            </div>
            <figcaption>
              <span>{hero?.label || m.galleryPreview}</span>
              <span aria-hidden="true">01</span>
            </figcaption>
          </figure>
          {supporting && (
            <figure className="landing-photo-secondary">
              <div>
                <Image
                  src={supporting.image}
                  alt={supporting.alt}
                  fill
                  priority
                  sizes="(max-width: 760px) 42vw, 20vw"
                />
              </div>
              <figcaption>{supporting.label || m.galleryPreview}</figcaption>
            </figure>
          )}
          <span className="landing-photo-edition">AZ / RU / EN</span>
        </div>
        <div className="landing-hero-footnote">
          <span>{m.eventTypes}</span>
          <p>
            {photos
              .filter((photo) => photo.label)
              .map((photo) => photo.label)
              .join(" / ")}
          </p>
          <a
            href={
              c.walkthrough.showExamples !== false
                ? "#event-examples"
                : learnTarget
            }
          >
            {m.explore}
            <span aria-hidden="true">↘</span>
          </a>
        </div>
      </section>
      {c.walkthrough.showExamples !== false && (
        <ExampleGallery locale={locale} content={c} />
      )}
      {c.sections.order
        .filter((key) => c.sections[key])
        .map((key) => sections[key])}
      <section className="landing-closing">
        <div className="landing-section" data-reveal>
          <div>
            <span className="landing-kicker">SnapMatch</span>
            <h2>{c.closing.title}</h2>
            <p>{c.closing.description}</p>
          </div>
          <Link className="landing-button" href={`/${locale}/login`}>
            {c.closing.button}
            <Icon name="arrow" size={22} />
          </Link>
        </div>
      </section>
    </div>
  );
}
