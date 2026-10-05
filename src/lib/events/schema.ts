import { z } from "zod";
import { locales } from "@/lib/i18n";
export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
export const MAX_COVER_BYTES = 2 * 1024 * 1024;
export const uuidSchema = z.uuid();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" &&
      value <= "2200-12-31"
    );
  });
export const eventSchema = z
  .object({
    id: uuidSchema,
    title: z.string().trim().min(1).max(200),
    event_date: dateSchema.refine((value) => value <= "2100-12-31"),
    venue: z.string().trim().max(300),
    languages: z
      .array(z.enum(locales))
      .min(1)
      .max(3)
      .refine((items) => new Set(items).size === items.length),
    default_locale: z.enum(locales),
    allow_original_download: z.boolean(),
    watermark_enabled: z.boolean(),
    expiry: z.union([z.literal(""), dateSchema]),
  })
  .strict()
  .refine((value) => value.languages.includes(value.default_locale), {
    path: ["default_locale"],
  })
  .refine((value) => !value.expiry || value.expiry >= value.event_date, {
    path: ["expiry"],
  });
export const uploadSchema = z
  .object({
    upload_key: z.string().regex(/^[a-f0-9]{64}$/),
    original_filename: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !/[\x00-\x1f\x7f]/.test(value)),
    bytes: z.number().int().min(3).max(MAX_PHOTO_BYTES),
  })
  .strict();
export type EventInput = z.infer<typeof eventSchema>;
export type PhotographerEvent = {
  id: string;
  photographer_id: string;
  slug: string;
  title: string;
  event_date: string;
  venue: string | null;
  cover_path: string | null;
  languages: (typeof locales)[number][];
  default_locale: (typeof locales)[number];
  allow_original_download: boolean;
  watermark_enabled: boolean;
  face_expires_at: string;
  status: "draft" | "active" | "closed" | "face_search_expired" | "deleting";
};
export function bakuDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key)!.value)
    .join("-");
}
export function defaultExpiry(date: string) {
  const value = dateSchema.safeParse(date);
  if (!value.success) return "";
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + 30);
  return result.toISOString().slice(0, 10);
}
