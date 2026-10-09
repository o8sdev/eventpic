// Trusted local bootstrap only. Never expose this operation through a public route.
import env from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
env.loadEnvConfig(process.cwd());
const email = z.email().parse(process.env.ADMIN_BOOTSTRAP_EMAIL);
const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = z.string().min(1).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
const service = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Membership must already have been provisioned through the trusted SQL helper.
// Resolve the exact account from Auth; never grant a role from email metadata.
const { data: members, error: memberError } = await service
  .from("system_admins")
  .select("user_id")
  .eq("enabled", true);
if (memberError) throw new Error("Unable to read admin membership");
let user;
for (const member of members ?? []) {
  const { data, error } = await service.auth.admin.getUserById(member.user_id);
  if (error) throw new Error("Unable to inspect the admin account");
  if (data.user.email?.toLowerCase() === email.toLowerCase()) user = data.user;
}
if (!user) throw new Error("Provision the intended admin membership first");
const password = randomBytes(18).toString("base64url");
await mkdir("tmp", { recursive: true });
// Write before applying; a filesystem failure must not leave an unknown password.
// Refuse to overwrite a previous handoff without deliberate operator action.
await writeFile(
  "tmp/admin-login.txt",
  `SnapMatch admin login\nURL: ${process.env.SITE_URL}/en/login\nEmail: ${email}\nPassword: ${password}\n\nPrivate local credential. This file is excluded from Git.\n`,
  { flag: "wx", mode: 0o600 },
);
const result = await service.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
});
if (result.error)
  throw new Error(
    "Password provisioning failed; the local handoff file is not valid",
  );
const probe = createClient(
  url,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const signedIn = await probe.auth.signInWithPassword({ email, password });
if (signedIn.error) throw new Error("Password sign-in verification failed");
const admin = await probe.rpc("is_system_admin");
await probe.auth.signOut({ scope: "local" });
if (admin.error || admin.data !== true)
  throw new Error("The signed-in account was not recognized as admin");
console.log(
  "Verified admin password sign-in. Credentials saved to ignored tmp/admin-login.txt.",
);
