// Live local integration test. Creates one disposable example.invalid account
// through the admin form, verifies role isolation, revokes its session and removes it.
import env from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
env.loadEnvConfig(process.cwd());
const base = "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const credentialFile = await readFile("tmp/admin-login.txt", "utf8");
const adminEmail = credentialFile.match(/^Email: (.+)$/m)?.[1];
const adminPassword = credentialFile.match(/^Password: (.+)$/m)?.[1];
assert.ok(adminEmail && adminPassword, "Local admin credentials are required");
function session() {
  const jar = new Map();
  const client = createServerClient(url, publicKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) =>
        items.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  return {
    client,
    cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
  };
}
const admin = session(),
  photographer = session();
const suffix = randomUUID();
const email = `snapmatch-qa-${suffix}@example.invalid`;
const password = randomBytes(18).toString("base64url");
let createdId;
try {
  const signedIn = await admin.client.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  assert.equal(signedIn.error, null, "Admin password sign-in must succeed");
  const page = await fetch(`${base}/en/admin/accounts`, {
    headers: { Cookie: admin.cookie() },
  });
  assert.equal(page.status, 200);
  const html = await page.text();
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
    .map((x) => x[0])
    .find((x) => x.includes('name="full_name"'));
  const action = form?.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
  assert.ok(action, "Admin creation form must be available");
  function input(address) {
    const body = new FormData();
    for (const [key, value] of Object.entries({
      [action]: "",
      locale: "en",
      full_name: "Disposable access test",
      business_name: "Automated local verification",
      email: address,
      password,
    }))
      body.set(key, value);
    return body;
  }
  const created = await fetch(`${base}/en/admin/accounts`, {
    method: "POST",
    headers: { Cookie: admin.cookie(), Origin: base },
    body: input(email),
    redirect: "manual",
  });
  assert.equal(created.status, 303, "The creation action must redirect");
  const destination = new URL(created.headers.get("location"), base);
  assert.equal(destination.searchParams.get("notice"), "accountCreated");
  createdId = destination.searchParams.get("owner");
  assert.match(createdId, /^[a-f0-9-]{36}$/);
  const user = await service.auth.admin.getUserById(createdId);
  assert.equal(user.data.user.email, email);
  assert.ok(
    user.data.user.email_confirmed_at,
    "No verification email should be required",
  );
  const login = await photographer.client.auth.signInWithPassword({
    email,
    password,
  });
  assert.equal(
    login.error,
    null,
    "The new photographer must sign in immediately",
  );
  assert.equal((await photographer.client.rpc("is_system_admin")).data, false);
  assert.equal(
    (
      await fetch(`${base}/en/dashboard`, {
        headers: { Cookie: photographer.cookie() },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/en/admin`, {
        headers: { Cookie: photographer.cookie() },
      })
    ).status,
    404,
  );
  const forbidden = await fetch(`${base}/en/admin/accounts`, {
    method: "POST",
    headers: { Cookie: photographer.cookie(), Origin: base },
    body: input(`blocked-${suffix}@example.invalid`),
    redirect: "manual",
  });
  assert.equal(
    forbidden.status,
    404,
    "A photographer must not call the admin creation action",
  );
  const audit = await service
    .from("admin_audit_log")
    .select("metadata")
    .eq("action", "photographer_created")
    .contains("metadata", { photographer_id: createdId });
  assert.equal(audit.error, null);
  assert.equal(audit.data.length, 1);
  assert.ok(
    !JSON.stringify(audit.data).includes(password),
    "Passwords must never reach audit metadata",
  );
  console.log(
    "PASS: admin password login, photographer creation without email confirmation, immediate photographer login, dashboard access, admin-route/action denial and password-free audit entry.",
  );
} finally {
  await admin.client.auth.signOut({ scope: "local" });
  await photographer.client.auth.signOut({ scope: "global" });
  if (createdId) {
    // Only delete the exact disposable account returned by this test's action.
    const user = await service.auth.admin.getUserById(createdId);
    assert.equal(
      user.data.user?.email,
      email,
      "Refuse to clean up a different account",
    );
    const removed = await service.auth.admin.deleteUser(createdId);
    assert.equal(
      removed.error,
      null,
      "Disposable account cleanup must succeed",
    );
    console.log(
      "Removed the disposable test account after revoking its session.",
    );
  }
}
