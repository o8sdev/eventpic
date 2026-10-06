import { messages, type Locale } from "@/lib/i18n";
import { sitePhotoPaths, type SiteContent } from "./schema";

// Marketing examples represent separate fictional events. A guest preview must
// stay within one event, just as the real search will be scoped to one collection.
const sampleEvents: Record<(typeof sitePhotoPaths)[number], string> = {
  "/images/event-birthday.webp": "birthday",
  "/images/event-corporate.webp": "corporate",
  "/images/event-concert.webp": "concert",
  "/images/event-graduation.webp": "graduation",
  "/images/event-family.webp": "family",
  "/images/wedding-editorial.png": "wedding",
  "/images/wedding-reception.webp": "wedding",
  "/images/wedding-dance.webp": "wedding",
  "/images/wedding-friends.webp": "wedding",
};

export function samplePhotoLabel(
  locale: Locale,
  image: (typeof sitePhotoPaths)[number],
) {
  const m = messages[locale].modern;
  const labels: Record<string, string> = {
    birthday: m.birthdayLabel,
    corporate: m.corporateLabel,
    concert: m.concertLabel,
    graduation: m.graduationLabel,
    family: m.familyLabel,
    wedding: m.weddingLabel,
  };
  return labels[sampleEvents[image]];
}

export function guestPreviewPhotos(content: SiteContent) {
  const { branding } = content;
  const photos = branding.examplePhotos || [];
  const hero = sitePhotoPaths.find((path) => path === branding.heroImage);
  const cover = hero || photos[0]?.image;
  if (!cover) return [];
  const sameEvent = photos.filter(
    (photo) => sampleEvents[photo.image] === sampleEvents[cover],
  );
  return sameEvent.length
    ? sameEvent.slice(0, 4)
    : [{ image: cover, alt: branding.imageAlt }];
}
