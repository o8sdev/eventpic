import assert from "node:assert/strict";

// Run against the local app. These requests neither send email nor create a
// session. A fake callback without a verifier must fail before code exchange.
const origin = "http://localhost:3000";
const checks = [
  ["/auth/confirm?code=not-a-real-auth-code", "authBrowser"],
  ["/auth/confirm?error=access_denied&error_code=otp_expired", "authExpired"],
  ["/auth/confirm?error=access_denied&error_code=unknown", "authError"],
  ["/auth/confirm?code=not-a-real-auth-code&sb_flow_id=invalid!", "authError"],
  ["/auth/confirm?next=https://example.com&locale=../../admin", "authError"],
];
for (const [path, notice] of checks) {
  const response = await fetch(`${origin}${path}`, { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    `${origin}/en/login?notice=${notice}`,
  );
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  // Supabase may clear a stale verifier, but no successful auth session can be set.
  assert.doesNotMatch(
    response.headers.get("set-cookie") ?? "",
    /auth-token(?:\.\d+)?=base64-/,
  );
  const page = await fetch(response.headers.get("location"));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /role="alert"/);
}
console.log(
  "PASS: callback failures stay on the trusted origin, distinguish browser/expiry errors, avoid caching and never create a session.",
);
