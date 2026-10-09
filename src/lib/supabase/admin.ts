import "server-only";
import { createClient } from "@supabase/supabase-js";

export function adminClientConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// Call only after authenticating and authorizing the incoming request. This
// client bypasses RLS; it is never shared with browser code or persisted sessions.
export function createAdminClient() {
  if (!adminClientConfigured())
    throw new Error("Server account management is unavailable");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
