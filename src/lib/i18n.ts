import az from "@/messages/az.json";
import ru from "@/messages/ru.json";
import en from "@/messages/en.json";
export const locales = ["az", "ru", "en"] as const;
export type Locale = (typeof locales)[number];
export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}
export const messages = { az, ru, en };
