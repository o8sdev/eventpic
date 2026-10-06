import { messages, type Locale } from "@/lib/i18n";
import { siteContentSchema, type SiteContent } from "./schema";
import { samplePhotoLabel } from "./photos";

export function defaultSiteContent(locale: Locale): SiteContent {
  const t = messages[locale];
  const m = t.modern;
  const l = t.landing;
  return siteContentSchema.parse({
    navigation: {
      how: l.navHow,
      studio: l.navStudio,
      faq: l.navFaq,
      signIn: t.login,
    },
    hero: {
      badge: m.badge,
      title: m.title,
      accent: m.accent,
      description: m.description,
      primary: m.primary,
      secondary: m.secondary,
      notice: l.note,
    },
    walkthrough: {
      kicker: m.howKicker,
      title: m.howTitle,
      description: l.howDescription,
      steps: l.steps.map(({ title, body }) => ({ title, body })),
      examplesTitle: m.examplesTitle,
      examplesDescription: m.examplesDescription,
      showExamples: true,
    },
    studio: {
      kicker: l.studioEyebrow,
      title: m.studioTitle,
      description: l.studioBody,
      features: l.benefits,
    },
    privacy: {
      kicker: l.privacyEyebrow,
      title: m.privacyTitle,
      description: l.privacyBody,
      items: l.privacyItems,
      linkLabel: l.privacyLink,
    },
    faqs: {
      title: l.faqTitle,
      items: l.faqs.map(({ q, a }) => ({ question: q, answer: a })),
    },
    closing: {
      title: m.closingTitle,
      description: l.closingBody,
      button: m.primary,
    },
    footer: {
      description: m.footerDescription,
      product: m.product,
      company: m.company,
      legal: m.legal,
      contact: m.contact,
      copyright: m.copyright,
    },
    company: {
      legalName: "",
      email: "",
      phone: "",
      address: "",
      registrationNumber: "",
      instagram: "",
      facebook: "",
      linkedin: "",
    },
    legal: {
      privacyTitle: t.privacyTitle,
      privacyBody: t.privacyBody,
      privacyReviewed: false,
      termsTitle: m.termsTitle,
      termsBody: m.termsBody,
      termsReviewed: false,
    },
    branding: {
      logoPath: "/brand/snapmatch-logo.png",
      iconPath: "/brand/snapmatch-icon.png",
      heroImage: "/images/event-birthday.webp",
      imageAlt: l.imageAlt,
      examplePhotos: [
        {
          image: "/images/event-birthday.webp",
          alt: l.imageAlt,
          label: m.birthdayLabel,
        },
        {
          image: "/images/event-corporate.webp",
          alt: m.corporateAlt,
          label: m.corporateLabel,
        },
        {
          image: "/images/event-concert.webp",
          alt: m.concertAlt,
          label: m.concertLabel,
        },
        {
          image: "/images/event-graduation.webp",
          alt: m.graduationAlt,
          label: m.graduationLabel,
        },
        {
          image: "/images/event-family.webp",
          alt: m.familyAlt,
          label: m.familyLabel,
        },
        {
          image: "/images/wedding-editorial.png",
          alt: m.weddingAlt,
          label: m.weddingLabel,
        },
      ],
    },
    seo: {
      title: "SnapMatch",
      description: m.description.slice(0, 200),
      image: "/images/event-birthday.webp",
    },
    sections: {
      order: ["how", "studio", "privacy", "faq"],
      how: true,
      studio: true,
      privacy: true,
      faq: true,
    },
  });
}

// Add new presentation fields without discarding existing published copy.
export function withSiteDefaults(
  locale: Locale,
  content: SiteContent,
): SiteContent {
  const defaults = defaultSiteContent(locale);
  return {
    ...content,
    walkthrough: { ...defaults.walkthrough, ...content.walkthrough },
    branding: {
      ...defaults.branding,
      ...content.branding,
      examplePhotos: (
        content.branding.examplePhotos || defaults.branding.examplePhotos
      )?.map((photo) => ({
        ...photo,
        label: photo.label ?? samplePhotoLabel(locale, photo.image),
      })),
    },
  };
}
