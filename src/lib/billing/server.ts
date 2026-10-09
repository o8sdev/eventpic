import "server-only";
import { cache } from "react";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { pricingSchema, type Plan } from "./schema";

// Fail closed: never advertise fallback prices when the authoritative catalog is unavailable.
export const getPricing = cache(async () => {
  if (!isConfigured()) return null;
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("get_pricing_catalog");
    const parsed = pricingSchema.safeParse(data);
    return !error && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});

export type PlanUsage = {
  expired: boolean;
  plan: Plan;
  account: {
    photographer_id: string;
    plan_version_id: string;
    state: "trial" | "active" | "suspended";
    valid_until: string;
    version: number;
    storage_used: number;
    storage_reserved: number;
    bonuses: {
      photos: number;
      storage_bytes: number;
      active_events: number;
      searches: number;
      delivery_bytes: number;
    };
    bonus_until: string | null;
    next_plan_version_id: string | null;
    next_at: string | null;
  };
  usage: { photos: number; searches: number; delivery_bytes: number };
  period_start: string;
  period_end: string;
  active_events: number;
};
