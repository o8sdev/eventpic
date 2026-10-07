import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// Deployment environment wins. A local checkout can reuse the root .env.local.
try {
  loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .url()
    .refine(
      (url) =>
        new URL(url).protocol === "https:" ||
        ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
    ),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  AWS_REGION: z.literal("eu-central-1").default("eu-central-1"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  WORKER_POLL_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
});
export function config() {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Invalid worker configuration: ${result.error.issues.map((item) => item.path.join(".")).join(", ")}`,
    );
  return { ...result.data, workerId: `worker-${randomUUID()}` };
}
