import { z } from "zod";

export const passwordSignInSchema = z.object({
  email: z.email().trim().max(254),
  password: z.string().min(1).max(72),
});

export const photographerAccountSchema = passwordSignInSchema.extend({
  password: z.string().min(12).max(72),
  full_name: z.string().trim().min(1).max(120),
  business_name: z.string().trim().max(160),
});
