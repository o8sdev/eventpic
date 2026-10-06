import { z } from "zod";

const short = z.string().trim().min(1).max(180);
const copy = z.string().trim().min(1).max(1200);
const optional = z.string().trim().max(300);
const link = z.union([
  z.literal(""),
  z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS URL"),
]);
export const sitePhotoPaths = [
  "/images/wedding-editorial.png",
  "/images/wedding-reception.webp",
  "/images/wedding-dance.webp",
  "/images/wedding-friends.webp",
] as const;
export const siteImagePaths = [
  ...sitePhotoPaths,
  "/brand/snapmatch-logo.png",
  "/brand/snapmatch-icon.png",
] as const;
const pair = z.object({ title: short, body: copy }).strict();
export const sectionNames = ["how", "studio", "privacy", "faq"] as const;

// Only typed text, approved local assets, and HTTPS links; React escapes all copy.
// This document never contains API keys, scripts, HTML, or private event media.
export const siteContentSchema = z
  .object({
    navigation: z
      .object({ how: short, studio: short, faq: short, signIn: short })
      .strict(),
    hero: z
      .object({
        badge: short,
        title: short,
        accent: short,
        description: copy,
        primary: short,
        secondary: short,
        notice: short,
      })
      .strict(),
    walkthrough: z
      .object({
        kicker: short,
        title: short,
        description: copy,
        steps: z.array(pair).min(3).max(4),
        examplesTitle: short.optional(),
        examplesDescription: copy.optional(),
        showExamples: z.boolean().optional(),
      })
      .strict(),
    studio: z
      .object({
        kicker: short,
        title: short,
        description: copy,
        features: z.array(pair).min(1).max(6),
      })
      .strict(),
    privacy: z
      .object({
        kicker: short,
        title: short,
        description: copy,
        items: z.array(pair).min(1).max(6),
        linkLabel: short,
      })
      .strict(),
    faqs: z
      .object({
        title: short,
        items: z
          .array(z.object({ question: short, answer: copy }).strict())
          .min(1)
          .max(12),
      })
      .strict(),
    closing: z
      .object({ title: short, description: copy, button: short })
      .strict(),
    footer: z
      .object({
        description: copy,
        product: short,
        company: short,
        legal: short,
        contact: short,
        copyright: short,
      })
      .strict(),
    company: z
      .object({
        legalName: optional,
        email: z.union([z.literal(""), z.email().max(254)]),
        phone: z
          .string()
          .trim()
          .max(40)
          .regex(/^[+\d\s().-]*$/),
        address: optional,
        registrationNumber: optional,
        instagram: link,
        facebook: link,
        linkedin: link,
      })
      .strict(),
    legal: z
      .object({
        privacyTitle: short,
        privacyBody: z.string().trim().min(1).max(12000),
        privacyReviewed: z.boolean(),
        termsTitle: short,
        termsBody: z.string().trim().min(1).max(12000),
        termsReviewed: z.boolean(),
      })
      .strict(),
    branding: z
      .object({
        logoPath: z.enum(siteImagePaths),
        iconPath: z.enum(siteImagePaths),
        heroImage: z.enum(siteImagePaths),
        imageAlt: short,
        examplePhotos: z
          .array(
            z.object({ image: z.enum(sitePhotoPaths), alt: short }).strict(),
          )
          .min(3)
          .max(6)
          .optional(),
      })
      .strict(),
    seo: z
      .object({
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(200),
        image: z.enum(siteImagePaths),
      })
      .strict(),
    sections: z
      .object({
        order: z
          .array(z.enum(sectionNames))
          .length(4)
          .refine((items) => new Set(items).size === 4),
        how: z.boolean(),
        studio: z.boolean(),
        privacy: z.boolean(),
        faq: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type SiteContent = z.infer<typeof siteContentSchema>;
