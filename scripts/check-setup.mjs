import env from "@next/env";
import { z } from "zod";

env.loadEnvConfig(process.cwd());

const origin = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === "/"
  );
});
const parsed = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
    SITE_URL: origin,
  })
  .safeParse(process.env);

if (!parsed.success) {
  console.error("Setup is incomplete. Check these variables in .env.local:");
  for (const name of new Set(parsed.error.issues.map((issue) => issue.path[0])))
    console.error(`- ${name}`);
  process.exitCode = 1;
} else {
  const settings = parsed.data;
  let failures = 0;
  console.log(`Supabase: ${new URL(settings.NEXT_PUBLIC_SUPABASE_URL).hostname}`);
  console.log(`Web app: ${settings.SITE_URL}`);

  async function check(label, task) {
    try {
      const detail = await task();
      console.log(`PASS ${label}${detail ? `: ${detail}` : ""}`);
    } catch {
      // Never log response bodies, request headers, keys or session tokens.
      console.error(`FAIL ${label}`);
      failures += 1;
    }
  }

  async function api(path, options = {}) {
    return fetch(new URL(path, settings.NEXT_PUBLIC_SUPABASE_URL), {
      ...options,
      headers: {
        apikey: settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  }

  await Promise.all([
    check("Auth health", async () => {
      const response = await api("/auth/v1/health");
      if (!response.ok) throw new Error();
    }),
    check("Email sign-in enabled", async () => {
      const response = await api("/auth/v1/settings");
      if (!response.ok) throw new Error();
      const config = await response.json();
      if (!config.external?.email || config.disable_signup) throw new Error();
    }),
    check("Published website content RPC", async () => {
      const response = await api("/rest/v1/rpc/get_site_content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_locale: "az" }),
      });
      if (!response.ok) throw new Error();
    }),
    ...["events", "system_admins"].map((table) =>
      check(`Anonymous access denied for ${table}`, async () => {
        const response = await api(`/rest/v1/${table}?select=*&limit=1`);
        if (![401, 403].includes(response.status)) throw new Error();
      }),
    ),
    check("Local web app", async () => {
      const response = await fetch(new URL("/az/login", settings.SITE_URL), {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
    }),
    ...["dashboard", "admin"].map((page) =>
      check(`Anonymous ${page} redirects to sign-in`, async () => {
        const response = await fetch(new URL(`/az/${page}`, settings.SITE_URL), {
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
        });
        const location = response.headers.get("location");
        if (![302, 303, 307, 308].includes(response.status) || !location)
          throw new Error();
        const target = new URL(location, settings.SITE_URL);
        if (
          target.origin !== new URL(settings.SITE_URL).origin ||
          target.pathname !== "/az/login"
        )
          throw new Error();
      }),
    ),
  ]);
  console.log(
    "This read-only check does not verify email delivery, signed-in uploads or AWS indexing.",
  );
  if (failures) process.exitCode = 1;
}
