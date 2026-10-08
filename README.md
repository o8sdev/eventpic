# SnapMatch

Private event management and photo delivery for professional photographers. Phase 1 provides a Next.js App Router / TypeScript / Tailwind app, an English interface, Supabase migrations and RLS, photographer email magic-link authentication, profile editing with private logos, and a protected dashboard shell.

Phase 2 adds event creation/editing, private covers, QR PNG and A5 PDF downloads, and resumable bulk uploads. Phase 3 adds the separate processing worker, face indexing, durable retries and a live photographer gallery. Guest flows are not implemented yet. The privacy notice is a translated draft for legal review, not a production policy.

## Run the web app

Use Node.js 22.12+ and npm (validated here with Node 26). From this directory:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000/en. The public homepage uses an image-free layout, large typography, neutral backgrounds, a sticky navbar, scroll reveals and a full footer. Photographer sign-in lives at `/en/login`. Old `/az` and `/ru` GET/HEAD paths redirect to English, preserving the path and query. Without Supabase values the login route shows a setup screen; protected routes redirect there. No fake login or demo data bypass is installed.

Run `npm run check:setup` while the web app is running to verify the configured Supabase connection, email sign-in availability, published-content RPC and anonymous table restrictions. It reads `.env.local`, makes no database changes and does not print credentials. Email delivery, authenticated uploads and AWS processing require separate integration checks.

Do not overwrite an existing `.env.local` when it already contains your settings. It is ignored by git. Only the Supabase URL and publishable key may use `NEXT_PUBLIC_` variables. Never expose a service role or AWS secret with that prefix.

## Local Supabase

Install and start Docker Desktop, then:

```powershell
npx supabase start
npx supabase db reset
npx supabase status
```

`db reset` rebuilds **local development data**. Do not use it against a database containing data you need. Migrations are under `supabase/migrations`; local configuration is `supabase/config.toml`.

Copy the local API URL and publishable key (or legacy anon key) from `supabase status` to `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Set `SITE_URL=http://localhost:3000`, then restart Next.js. Always use the same hostname when opening the app and its email links.

Local mail is captured at http://127.0.0.1:54324. Request a link from `/en/login`, open the captured email, and follow the link in the same browser. The default Supabase email template uses `{{ .ConfirmationURL }}`; the application exchanges its PKCE `code` at `/auth/confirm`.

For links that must work across browsers, customize both the magic-link and signup-confirmation templates to use the token-hash route instead:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">SnapMatch</a>
```

`RedirectTo` already contains `?locale=...`. Both routes validate their inputs and redirect only to the English dashboard or system-admin portal, according to trusted database membership. Email copy and delivery customization can be added alongside production SMTP setup.

## Hosted Supabase alternative

Create a fresh Supabase project and apply the SQL files in filename order via the SQL editor, or link the CLI project and run `supabase db push` after reviewing the target. Configure your exact site origin and allow these Auth redirect URLs, replacing the example origin:

```text
https://your-domain.example/auth/confirm?locale=en
```

Enable email sign-in, configure SMTP for production, and put the project's public URL/key and matching `SITE_URL` in the deployment environment. HTTPS is required in production: session cookies are Secure there. Do not deploy the guest/face-search product until the later phases are complete.

The configured hosted project uses `http://localhost:3000` as its Site URL. On 2026-10-06 its three exact localized callback URLs were added to the Auth allow list. Its current email sender is Supabase's default service, which sends only to project-team email addresses. Configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) before inviting other photographers. Keep email verification enabled; do not bypass it to work around delivery configuration.

## Environment variables

| Variable                                     | Purpose                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                   | Supabase API URL                                                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`       | Public publishable key (legacy anon key also supported)                                         |
| `SITE_URL`                                   | Trusted absolute origin for auth redirects                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`                  | Reserved for server guest handlers and worker; unused by Phases 1 and 2                         |
| `AWS_REGION`                                 | `eu-central-1`; reserved for worker/server recognition                                          |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Reserved for local AWS credentials; prefer host IAM roles in production                         |
| `ADMIN_BOOTSTRAP_EMAIL`                      | Local provisioning helper only; never used as an application authorization rule                 |
| `IP_HASH_SECRET`                             | Reserved for keyed IP hashing in guest flows; generate a random secret before implementing them |

## Security design

- All 11 product tables and four site-admin tables have RLS. Anonymous users have no table access. Authenticated users can select only their own profile, events and photos, and update approved profile fields. New accounts receive a profile through an auth trigger that does not trust signup metadata.
- The server verifies photographer identity with `getUser()`. Proxy refreshes cookies, and protected pages/actions verify authorization again. SSR cookies are httpOnly, SameSite=Lax, and Secure in production. Next.js Server Actions provide same-origin checks for form submissions. The Supabase public client is used with the photographer's session; Phase 1 does not use a service-role client.
- `photographer_event_summary()` is a narrow SECURITY DEFINER function with an empty search path and explicit `auth.uid()` ownership filter. It returns counts rather than guest identifiers. Download counts count download actions, not individual photos. Fuller metrics arrive in Phase 6.
- Events and photos cannot be directly mutated by browser roles. Phase 2 provides authenticated, validated server handlers and guarded owner RPCs; deletion must coordinate Storage and AWS cleanup before deleting database rows. Never directly delete an auth user or event in production before external cleanup: database cascades cannot remove external resources.
- All four buckets (`originals`, `web`, `thumbnails`, `branding`) are private. Event objects use `<photographer-id>/<event-id>/<photo-id>/<filename>`. Photographer reads check both the owner prefix and event ownership. No anonymous policies exist. Original upload permissions are scoped to reserved pending photos. Server handlers issue signed upload URLs using the photographer session. There is no originals UPDATE/DELETE policy.
- Logos use `<photographer-id>/logo.png`. The authenticated upload action validates MIME/size, decodes with a 16-million-pixel limit, rotates, scales to 512px, strips metadata and writes PNG. Storage policies and a profile constraint restrict the path to that photographer. Previews use a one-hour signed URL. Logo replacement overwrites a stable path to avoid orphan files.
- Composite foreign keys prevent cross-event face/match/job references. Download references are checked by a trigger. Family matches include `selfie_index` in the primary key so one indexed face can be retained for multiple searches.
- `consents` and `audit_log` intentionally have no FKs. Update, delete and truncate are blocked by triggers; the service role only gets append/read privileges on these tables. Removal requests have mutable lifecycle status; future handlers must append transitions to `audit_log`. Never put images, selfies or raw IPs in audit metadata.
- `claim_jobs(n, worker_id)` is service-role-only, uses atomic UPDATE plus `FOR UPDATE SKIP LOCKED`, and increments attempts on claim. It accepts 1–100 jobs. The Phase 3 worker renews five-minute leases, fences stale workers, retries with backoff and atomically commits results. Dead jobs can be retried by their event owner after a cooldown.
- Default expiry is midnight Asia/Baku on `event_date + 30 days`; explicit expiry is preserved. Changing event_date does not silently extend an existing retention period. Slugs use 12 random hexadecimal characters rather than eight, for a larger collision space; the unique constraint remains authoritative. They are identifiers, not authorization secrets.

Auth implementation follows [Supabase's SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and the [Next.js Proxy convention](https://nextjs.org/docs/app/getting-started/proxy).

## Verify the foundation

```powershell
npm run lint
npm run typecheck
npm run test:db
npm run test:events
npm run test:site
npm run build
npm start
```

`test:db` runs the migration SQL using PGlite (embedded Postgres) with minimal fixtures for Supabase's managed auth and storage schemas. It checks owner isolation, anonymous restrictions, storage visibility, cross-event constraints, expiry, append-only records, cascade behavior, duplicate upload keys, family match keys and job claim/retry eligibility. Admin checks cover membership isolation/revocation, private drafts, publishing, restoring, immutable history and optimistic version conflicts. It does **not** replace tests against real Supabase Auth/Storage or a multi-connection worker concurrency test.

Manual integration checks once Supabase is connected:

1. Open `/az`, `/ru` and `/en`; verify language switching and each privacy page.
2. Request a magic link, follow the email and verify the empty dashboard. Reusing an expired/used link should show the translated error.
3. Edit your name, business name and phone; reload and verify persistence. Upload a JPEG/PNG logo smaller than 2 MB; verify its preview URL is signed and the bucket remains private.
4. Sign out and open `/az/dashboard` directly; it must return to `/en/login`.
5. Use two photographer accounts and verify ownership isolation. Do not expose test credentials in the repository.

Database SQL is tested in PGlite. On 2026-10-07, all six migrations had been applied to the configured hosted EventPic project, which is active in `eu-central-1`. Local migration timestamps match its recorded migration history. Hosted checks confirmed RLS on all 15 tables, four private buckets, successful Auth/public-content responses, anonymous event/admin access denial, and service-role-only job claiming. Live email delivery, session refresh and authenticated Storage integration remain unverified. Docker is unavailable in the development environment; this checkout uses hosted Supabase.

Supabase's advisor reports intentional access patterns: [RLS with no browser policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) on eight server/worker tables, [public execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) of the published-marketing-content RPC, and [authenticated execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) of guarded owner/admin RPCs. These functions have empty search paths and explicit ownership/membership checks where needed. Do not add broad policies or revoke required RPC access merely to hide these notices.

`npm audit` currently reports five high-severity entries in the development-only Next ESLint dependency chain (`braces` / `micromatch` / `fast-glob`). The suggested automatic fix downgrades Next's lint config across major versions; it is not applied. Production dependency audit is checked separately.

## Layout

```text
src/app/[locale]/       localized landing, login, dashboard, profile, legal/contact, admin
src/app/auth/confirm/   magic-link verification and PKCE exchange
src/lib/supabase/       server-only session client
src/messages/          English application copy (legacy files are not loaded)
supabase/migrations/   schema, authorization, private storage and site-admin CMS
scripts/test-db.mjs    migration and security regression checks
worker/                separate Node processing service
```

## Phases

1. Foundation, schema/RLS, auth, dashboard shell, i18n (complete).
2. Event creation, QR/poster, resumable bulk upload (implemented; hosted schema deployed, authenticated integration pending).
3. Worker, derivatives, face indexing, queue recovery and live status.
4. Guest consent, selfie/search, results and downloads.
5. Family search, removal, sessions, rate limits, purge and audit flows.
6. Stats, polish, sample data, matching/E2E tests and deployment guide.

Each phase starts with a plan and approval, and ends with verification and a git commit.

## Public website and site administration

SnapMatch's voice is built around the work after the shot. Marketing copy speaks to professional photographers through their day-to-day work: full memory cards, busy calendars and client handovers. Headlines can have personality; controls name the action plainly. Forms explain the choice, error messages give a practical next step, and technical setup details belong in admin tools or documentation. Keep privacy promises precise and avoid invented performance claims, location references or launch announcements. English copy lives in `src/messages/en.json`; published CMS copy takes precedence over its defaults.

The landing page contains no images or photo galleries. It uses large type, an off-white background, cobalt accents, a dark green photographer section, numbered steps and a sage contact section. Navigation, footer and section text are CMS-driven. Scroll reveals respect reduced-motion settings; FAQs use native disclosure controls. Event-creation prompts are removed from the landing page; sign-in remains in the navbar and footer, and the closing link leads to Contact. Photographer event creation remains in the dashboard. Public copy focuses on the photographer workflow, workspace and delivery controls, without location or launch-status announcements. Product and Resources dropdowns support keyboard navigation, Escape and outside-click dismissal, with grouped navigation on mobile. Public styles are scoped in `src/app/landing.css`.

All application routes and controls use English. Language selectors are removed and event forms submit English. Historical database locale values and CMS documents remain compatible; only English content is loaded and edited by the app. Retired image, availability-notice and primary-button fields remain in saved documents, but their landing-page editor controls are hidden. Supplied brand assets remain in `public/brand`; the landing uses a text/CSS wordmark. The browser icon and sharing image remain configurable. The sign-in page is also image-free, with a responsive email form and distinct success/error feedback. Photographer event pages still show private event images.

The system-admin portal at `/en/admin` provides:

- A counts-only platform overview, English publishing status, missing company details and legal-review reminders.
- Structured editing of navigation, hero, walkthrough, photographer benefits, privacy, FAQ, closing CTA, footer, company/contact/social details, legal text, SEO and branding.
- Section visibility/order and list-item editing. Text is escaped by React; arbitrary HTML/scripts are not accepted.
- Save draft, private saved-draft preview, publish, revision history, restore as a draft and an immutable activity log. Only English is edited and published through the app. Save failures preserve unsaved input; stale versions are rejected instead of overwriting someone else's work.

Company information starts empty. Contact details and social links appear when filled and published. Privacy and terms start as drafts awaiting legal review. Browser icon and Search & sharing selectors use the approved local asset library; media uploads and a general page builder are outside this scope. Existing CMS documents preserve their published copy.

### Provision the first admin

1. Apply pending migrations from `supabase/migrations` in filename order to the intended Supabase project. All five are already applied to this checkout's configured hosted project. The site-admin migration is `20261005145316_site_admin.sql`; it requires the earlier schema and immutable-record function.
2. Sign in with the intended admin email at `/en/login` and complete email verification. The provisioning helper requires an email-confirmed Auth account before granting membership.
3. Set `ADMIN_BOOTSTRAP_EMAIL` in your ignored `.env.local`, then run `npm run admin:bootstrap`. This creates ignored `supabase/bootstrap-admin.local.sql`.
4. Review and run that generated SQL in the project's trusted Supabase SQL Editor. It looks up the existing account and adds enabled membership; it fails if the account does not exist.
5. Open `/en/admin` after signing in. Subsequent magic-link sign-ins route enabled admins to the portal. Use the portal's photographer-dashboard link to reach the ordinary photographer tools.

An email in configuration does not grant access. Membership lives in `system_admins`; authenticated browser roles cannot add or enable themselves. To revoke access, set that account's membership `enabled=false` through a trusted database owner connection. No service-role key is needed by the website CMS.

### CMS access boundaries

Every admin page and action verifies the Supabase user and enabled membership. RLS protects draft, revision and audit reads. Browser roles cannot directly mutate these tables. The guarded `admin_content_change` RPC locks the locale row, checks its expected version and commits the draft/public snapshot, revision and audit entry together. SQL checks document shape/size, while server actions and public rendering enforce the full Zod schema. Missing or invalid public content falls back to translated defaults.

The public `get_site_content(locale)` RPC returns only published website content. This is intentionally public marketing copy; it never exposes drafts, accounts, private event media or guest data. The guarded admin overview returns aggregate counts only. Admin membership adds no direct access to other photographers' private event/guest rows. Revision and audit history survive account deletion and reject updates/deletes/truncation.

### Manual review

1. Review `/en` at mobile and desktop widths: no landing images, language selector or Create event links. Check Product/Resources dropdowns with keyboard, Escape and outside clicks, then section anchors, FAQs, mobile navigation, legal/contact links and back-to-top. Review the image-free login page and its sent/invalid/authError feedback states. Open `/az` and `/ru/login?notice=sent` to verify English redirects.
2. Anonymous access to `/en/admin` must return to login. A signed-in photographer without enabled admin membership must receive a 404.
3. As the provisioned admin, change and save a headline. Public copy must stay unchanged until Publish. Open the private preview, publish, then reload the public site.
4. Open two editor tabs and save in one; saving the stale tab must report a version conflict and retain its input. Restoring history must alter only the draft until published.
5. Edit English contact details, publish, and verify footer/contact pages. Revoke membership through SQL and verify privileged operations no longer work.

The public app and migration security checks can run locally. The hosted schema is deployed. Live CMS editing still requires first sign-in and trusted membership provisioning; the intended admin account did not exist at deployment time. Hosted magic-link delivery, authenticated Storage and the authenticated admin browser flow are not claimed as verified until tested.

## Phase 2: events and bulk uploads

Create an event from the dashboard, then use its detail page for sharing, settings and uploads. Events start as drafts. Title, date, venue, download settings, watermark choice and expiry are validated with Zod and again in the database. The expiry default is midnight Baku time, event date + 30 days. Editing a date preserves the prior expiry unless explicitly changed. Watermark settings are fixed once any photo is reserved; later processing must produce consistent delivery images.

Covers accept JPEG/PNG up to 2 MB and 40 megapixels. The server verifies authentication before decoding, validates actual image format, rotates/resizes, strips metadata and writes a new JPEG to the private branding bucket. Assigning the cover checks event ownership and the stored path. Referenced covers cannot be removed through the photographer Storage policy; unreferenced replacements can be cleaned up. Rare failed cleanup can leave an old object, which the later coordinated event-prefix cleanup must remove.

QR PNGs encode the configured `SITE_URL` plus `/e/[slug]`. A5 PDFs contain the event title, English instructions, expiry/privacy notice, logo and actual QR. Their bundled [Noto Sans font](https://github.com/notofonts/noto-fonts) supports Unicode event names and is redistributed with its OFL license in `public/fonts`. Set `SITE_URL` to the public deployment origin before printing QR posters. The current guest destination and poster clearly indicate preparation: consent/camera/search are implemented in Phase 4.

### Configure the database

Apply pending migrations in filename order, including `20261005145317_event_uploads.sql`. All five are already applied to this checkout's configured hosted project; do not rerun them there. For a **fresh project**, `npm run db:bundle` prepares an ignored `supabase/setup.local.sql` containing all migrations in one transaction for the trusted SQL Editor. For an existing project, apply only unapplied migrations. Membership provisioning remains a separate step after the Auth account exists. The photographer features do not require a service-role key.

### Upload behavior and access

- JPEGs up to 50 MB, four parallel uploads, one full-file hash buffer at a time, and a maximum 10,000 files per browser queue. The server limits upload metadata bodies to 4 KB.
- Full SHA-256 fingerprints are unique per event. A guarded RPC reserves a canonical path `<owner>/<event>/<photo>/original.jpg`. The ownership/status check and reservation use an event row lock. Duplicate reservations reuse the row; they never create additional photo rows or overwrite received originals.
- Signing uses the verified photographer session. Storage INSERT is allowed only for the exact reserved pending path in an owned editable event. Signed upload tokens are path-scoped and use `upsert=false`; files travel directly from browser to Storage. No JWT/session token or signed URL is saved in browser queue history.
- Completion verifies a JPEG header through a bounded range read, then the guarded database RPC checks Storage-computed size/MIME, changes status to uploaded, and inserts one processing job atomically. The Phase 3 worker fully decodes/validates the untrusted original before indexing it. Upload acknowledgement is separate from indexing readiness.
- Three total attempts with fresh signing and backoff handle network/storage failures. Pause aborts transfers. After reopening, reselect the same files: received files are skipped, stored files awaiting confirmation are finalized, and interrupted files restart. Resume is per file; partial bytes are not persisted. Browser history stores only filename, size, modification time and queue state under owner/event keys. Clearing it does not delete uploaded photos.
- Gallery pages contain 48 photos each, with private one-hour thumbnail/cover URLs. Queue pages contain 50 entries each. Original downloads may retain original EXIF metadata; the setting explains this. The worker strips GPS and other metadata from web/thumb derivatives.
- POST upload endpoints require a verified user, owned editable event and matching configured Origin. QR/poster GET endpoints are authenticated and owner-scoped. Responses are private/no-store. Anonymous and other photographers receive no private files.

[Supabase signed upload tokens expire after two hours](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl), while display URLs last one hour. Reservation timestamps are refreshed before signing. Coordinated deletion must mark the event deleting, block new signing, and allow outstanding upload tokens to expire (with a grace period) before final prefix cleanup so late uploads cannot recreate orphan files. No event/photo deletion UI is added before that coordinated cleanup exists.

### Verify Phase 2

Run lint, typecheck, `test:db`, `test:events` and the production build. New database checks cover owner-only event mutation, language/expiry rules, watermark locking, reserved-path policies, deduplication, size validation, atomic single-job completion, cover replacement/removal and closed-event restrictions. Event tests validate calendar rollover, input rules, QR pixel decoding and A5/Unicode PDF generation. Embedded Postgres fixtures do not exercise the hosted Storage HTTP implementation.

After applying migrations and signing in:

1. Create and edit an event; verify default/custom expiry, cover replacement and download settings. Reload to confirm persistence.
2. Download the QR and English A5 poster. Scan the QR to the preparation notice. Print the PDF at 100% A5 size.
3. Upload multiple JPEGs. Check per-file progress, received status and dashboard counts. Close mid-batch, return, reselect the same files and verify one photo/one job per fingerprint.
4. Pause/resume, interrupt the network, retry failed transfers, and confirm large/non-JPEG files produce friendly messages.
5. Use another photographer account: event routes, QR/poster endpoints, reservations and Storage access must remain isolated. Public guest search continues in Phase 4; processing and automatic status refresh are implemented in Phase 3.

The hosted schema and public API checks pass. Event/upload/email integration still requires an authenticated account for testing. Local SQL, asset generation and unauthenticated route checks are validated independently.

## Phase 3: processing worker and live gallery

See [worker/README.md](worker/README.md) for configuration, minimal AWS permissions, security boundaries, recovery behaviour and live acceptance steps. Install with `npm ci --prefix worker`; run `npm run worker:check`, `npm run worker:build`, then `npm run worker:start` alongside Next.js. Credentials stay in `.env.local` or the host environment.

The event gallery shows private thumbnails/full previews, aggregate statuses, face counts, zero-face explanations and localized failures. It refreshes automatically without reloading cached images; dead jobs offer a guarded retry. Run `npm run test:worker` for image and processing regression tests and `npm run test:db` for queue/RLS/lease tests. The migration is deployed, but live AWS/Storage processing still needs populated service/AWS credentials and a verified photographer sign-in.
