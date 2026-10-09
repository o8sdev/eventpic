import { z } from "zod";

export const GB = 1_000_000_000;
const text = z.string().trim().min(1).max(240);
export const planSchema = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_]{1,29}$/),
    name: text,
    description: text,
    price_minor: z.number().int().min(0).max(100_000_000),
    photos: z.number().int().min(1).max(1_000_000),
    storage_bytes: z
      .number()
      .int()
      .min(1_000_000)
      .max(100_000 * GB),
    active_events: z.number().int().min(1).max(10_000),
    searches: z.number().int().min(1).max(10_000_000),
    delivery_bytes: z
      .number()
      .int()
      .min(1_000_000)
      .max(100_000 * GB),
    trial_days: z.number().int().min(0).max(90),
    visible: z.boolean(),
    featured: z.boolean(),
    features: z.array(text).max(12),
  })
  .strict()
  .refine((p) =>
    p.code === "trial"
      ? p.trial_days > 0 && p.price_minor === 0 && !p.visible
      : p.trial_days === 0,
  );

export const pricingSchema = z
  .object({
    currency: z.literal("AZN"),
    visible: z.boolean(),
    heading: text,
    description: text,
    cta: text,
    note: z.string().trim().min(1).max(1200),
    plans: z.array(planSchema).min(2).max(10),
  })
  .strict()
  .refine(
    (c) =>
      new Set(c.plans.map((p) => p.code)).size === c.plans.length &&
      c.plans.filter((p) => p.code === "trial").length === 1 &&
      c.plans.filter((p) => p.featured && p.visible).length <= 1,
  );

export type Plan = z.infer<typeof planSchema>;
export type Pricing = z.infer<typeof pricingSchema>;
export const allowanceSchema = z
  .object({
    photos: z.number().int().min(0).max(1_000_000),
    storage_bytes: z
      .number()
      .int()
      .min(0)
      .max(100_000 * GB),
    active_events: z.number().int().min(0).max(10_000),
    searches: z.number().int().min(0).max(10_000_000),
    delivery_bytes: z
      .number()
      .int()
      .min(0)
      .max(100_000 * GB),
  })
  .strict();

export const assignmentSchema = z
  .object({
    owner: z.uuid(),
    version: z.number().int().nonnegative(),
    plan_version: z.uuid(),
    state: z.enum(["trial", "active", "suspended"]),
    valid_until: z.iso.datetime({ offset: true }),
    effective_at: z.iso.datetime({ offset: true }).nullable(),
    bonuses: allowanceSchema,
    bonus_until: z.iso.datetime({ offset: true }).nullable(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export function formatPrice(minor: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
    minor / 100,
  );
}
export function formatGB(bytes: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
    bytes / GB,
  );
}
export const quotaErrors = [
  "plan_expired",
  "plan_suspended",
  "plan_photos",
  "plan_storage",
  "plan_events",
  "plan_searches",
  "plan_delivery",
] as const;
export function quotaError(message: string) {
  return quotaErrors.find((code) => message === code);
}
