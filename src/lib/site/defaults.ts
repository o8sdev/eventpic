import { messages, type Locale } from "@/lib/i18n";
import { siteContentSchema, type SiteContent } from "./schema";

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
      heroImage: "/images/wedding-editorial.png",
      imageAlt: l.imageAlt,
    },
    seo: {
      title: "SnapMatch",
      description: m.description.slice(0, 200),
      image: "/images/wedding-editorial.png",
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
