# Plans, account access and metering

The database is authoritative. `pricing_catalog` holds the draft and published
revision; immutable `plan_versions` contain both AZN prices (integer qəpik) and
numeric entitlements. Public pricing reads the published revision through
`get_pricing_catalog()`. A database outage hides pricing rather than displaying
invented fallback prices. Only system admins can save, restore or publish drafts.

Launch plans: Essential 49 AZN, Pro 99 AZN, Studio 199 AZN per month. Trial: 14 days,
one event, 200 photos, 3 GB storage, 100 searches and 5 GB authorised downloads.
All values and copy can be changed in `/en/admin/plans`. Existing assignments
reference immutable versions and do not change when a new catalog is published.
Hiding a plan stops marketing it, without revoking existing assignments.

## Access is separate from payments

`/en/admin/accounts` assigns published plan versions, grants access until a chosen
UTC date, suspends access, schedules a future plan change or adds expiring capacity.
Every change requires a reason and creates an append-only admin audit entry.
Optimistic version checks prevent overwriting another admin's changes. An immediate
assignment cancels any pending change. Scheduled changes retain existing bonuses
and their expiry; change extras separately using an immediate assignment.

These are **manual access grants, not payment records**. No card is charged, no
invoice is issued and no automatic renewal is promised. Do not treat an active
account as proof of payment. Billing provider IDs, signed-webhook reconciliation,
refunds, proration, taxes and automatic renewals belong to the payments phase.
The current public CTA is an inquiry, not a checkout. Never trust a return URL or
client-submitted plan/price as proof of a successful payment.

## Quota semantics

- Trial starts on the first plan/usage operation. Trial has one allowance period;
  paid/manual active plans use UTC calendar-month anniversaries of the account
  anchor, preserving the anchor day across short months. Expired accounts show
  their final access period and retain read access. No expiration deletes data.
  Suspending a trial keeps its single period. Upgrading a trial longer than a
  month carries receipts accepted in the active calendar cycle into that cycle;
  older-cycle consumption stays in the audit ledger. Returning to a trial
  reconciles its total usage without erasing paid-cycle activity.
- Photo quota counts **new upload reservations**, once per event/file fingerprint,
  in the cycle in which the upload was accepted. Retries/completion/indexing do not
  debit again. Closing/deleting an event does not reset monthly usage. A fresh
  upload after a reservation is explicitly released is a new acceptance.
- Every reservation holds original bytes plus 5,000,000 bytes for web and
  1,000,000 for thumbnail output. Trusted Storage metadata replaces those holds
  with actual sizes. Worker outputs are bounded by these caps. The UI shows both
  actual bytes and reserved capacity. GB means 1,000,000,000 bytes.
- Draft and active events consume event slots. Closed, expired and deleting
  events do not. Closing releases the slot; reopening requires available capacity
  and unexpired face data. Existing stored files still consume storage.
- Uploads and account operations lock the same account row before checking quotas,
  so requests across different events cannot independently spend the last slot.
  Accepted uploads may finish after expiry or a downgrade using their existing
  reservations. New uploads and user-requested reprocessing require active access.
- `release_unused_uploads()` only releases pending files with no Storage object
  and no activity for over three hours (longer than signed upload tokens last).
  It frees storage holds, not the monthly acceptance count. It never deletes media.
- A Storage trigger meters all four managed private buckets, including covers and
  logos. It uses provider `metadata.size`, not user metadata. Size mismatches are
  rejected. Metadata-free rows used in rolled-back Storage permission probes are
  ignored. Renames/moves are intentionally unsupported. Delete files with the
  **Storage API**; do not delete `storage.objects` with SQL. The ledger decrements
  only when Storage removes the object, independently of photo/event deletion.
- Service workers cannot mutate immutable versions or usage receipts. Their
  privileged role is trusted for job execution and should never reach a browser.

## Guest-flow integration contract (next phase)

`consume_plan_usage(event_id, metric, amount, request_key)` is service-role-only.
It derives the owner from the event, checks active access, locks the account,
enforces `searches` or `delivery_bytes`, and atomically stores a receipt. It rejects
reusing a key with a different amount/event. There is no client quota-reset API.

Guest handlers are not implemented yet. They MUST authenticate the event-scoped
guest session, validate consent and photo matches, enforce guest/IP rate limits,
then call this RPC **before** AWS or download issuance. Use a server-owned operation
ID persisted with its result: a replayed receipt authorises returning the prior
result, not making a fresh AWS call or issuing an unrelated download. Each family
selfie is one search. Provider retries for an accepted operation do not charge the
photographer again; account for their infrastructure cost separately.

Delivery bytes represent the total actual file sizes authorised by a download
operation. They are NOT measured CDN egress: a one-hour signed URL can be reused,
and signed-link issuance alone cannot strictly cap network traffic. Before paid
guest delivery launches, add a controlled download/ZIP service (bounded streaming,
retry receipts and concurrency) plus provider traffic reconciliation/budget alerts.
Do not market this counter as a guaranteed hard cap on actual bandwidth, or bill
overages from it. Thumbnails, photographer previews and worker reads also incur
provider traffic outside this download counter.

Privacy/consent/removal, matching quality and face retention are not paywalls.
No paid capability is implemented merely by adding it to a plan's benefit text.

## Validation and operations

Run `npm run test:billing`, `npm run test:db`, `npm run lint`,
`npm run typecheck`, `npm run test:worker` and `npm run build`.
Billing tests use PGlite (Postgres in WASM) with minimal Supabase Auth/Storage
fixtures. They exercise SQL permissions, RLS, ledger idempotency and transaction
rollback; they do not replace a real signed-in Storage/AWS end-to-end test.

First admin setup remains the existing verified-sign-in/bootstrap procedure in
README. The membership is a database row, never user-editable JWT metadata.
To check accounting, compare `billing_accounts.storage_used` with the sum in
`billing_storage_objects`, and `storage_reserved` with remaining `photo_capacity`
holds. Investigate discrepancies; do not reset counters to unblock uploads.

Security advisor review: Supabase flags
[anonymous definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
for the two intentional, published-only content/catalog readers, and
[authenticated definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
for the scoped owner/admin RPCs. Their authorization checks are covered by the
database tests; private metering helpers remain non-executable by browser roles.
The eight service-only guest/job/audit tables intentionally have
[RLS with no browser policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
The project also reports
[leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
This protection is not enabled by the application; review project-plan support
and configure it before production password access. Do not disable RLS to clear
these advisor notices.
