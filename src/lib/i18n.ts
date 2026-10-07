import en from "@/messages/en.json";
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];
export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}
export const messages = { en };

// Preserve bookmarks and old email destinations without serving retired locales.
export function englishPath(pathname: string) {
  return pathname.replace(/^\/(az|ru)(?=\/|$)/, "/en");
}
