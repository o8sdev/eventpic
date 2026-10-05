# SnapMatch

Private event photo delivery for Azerbaijan. Phase 1 provides a Next.js App Router / TypeScript / Tailwind app, Azerbaijani (default), Russian and English, Supabase migrations and RLS, photographer email magic-link authentication, profile editing with private logos, and a protected dashboard shell.

Event creation, QR posters and bulk uploads are Phase 2. The worker, face indexing and guest flows are not implemented yet. The privacy notice is a translated draft for legal review, not a production policy.

## Run the web app

Use Node.js 22.12+ and npm (validated here with Node 26). From this directory:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. The public homepage uses the Modern Product design: blue/purple accents, an interactive product preview, a sticky navbar, scroll reveals and a complete footer. Photographer sign-in lives at `/az/login` (also `/ru/login` and `/en/login`). Without Supabase values the login route shows a translated setup screen; protected routes redirect there. No fake login or demo data bypass is installed.

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

Local mail is captured at http://127.0.0.1:54324. Request a link from `/az/login`, open the captured email, and follow the link in the same browser. The default Supabase email template uses `{{ .ConfirmationURL }}`; the application exchanges its PKCE `code` at `/auth/confirm`.

For links that must work across browsers, customize both the magic-link and signup-confirmation templates to use the token-hash route instead:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">SnapMatch</a>
```

`RedirectTo` already contains `?locale=...`. Both routes validate their inputs and redirect only to the matching locale's dashboard or system-admin portal, according to trusted database membership. Email copy and delivery customization can be added alongside production SMTP setup.

## Hosted Supabase alternative

Create a fresh Supabase project and apply the SQL files in filename order via the SQL editor, or link the CLI project and run `supabase db push` after reviewing the target. Configure your exact site origin and allow these Auth redirect URLs, replacing the example origin:

```text
https://your-domain.example/auth/confirm?locale=az
https://your-domain.example/auth/confirm?locale=ru
https://your-domain.example/auth/confirm?locale=en
```

Enable email sign-in, configure SMTP for production, and put the project's public URL/key and matching `SITE_URL` in the deployment environment. HTTPS is required in production: session cookies are Secure there. Do not deploy the guest/face-search product until the later phases are complete.

## Environment variables

| Variable                                     | Purpose                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                   | Supabase API URL                                                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`       | Public publishable key (legacy anon key also supported)                                         |
| `SITE_URL`                                   | Trusted absolute origin for auth redirects                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`                  | Reserved for server guest handlers and worker; unused by Phase 1                                |
| `AWS_REGION`                                 | `eu-central-1`; reserved for worker/server recognition                                          |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Reserved for local AWS credentials; prefer host IAM roles in production                         |
| `ADMIN_BOOTSTRAP_EMAIL`                      | Local provisioning helper only; never used as an application authorization rule                 |
| `IP_HASH_SECRET`                             | Reserved for keyed IP hashing in guest flows; generate a random secret before implementing them |

## Security design

- All 11 product tables and four site-admin tables have RLS. Anonymous users have no table access. Authenticated users can select only their own profile, events and photos, and update approved profile fields. New accounts receive a profile through an auth trigger that does not trust signup metadata.
- The server verifies photographer identity with `getUser()`. Proxy refreshes cookies, and protected pages/actions verify authorization again. SSR cookies are httpOnly, SameSite=Lax, and Secure in production. Next.js Server Actions provide same-origin checks for form submissions. The Supabase public client is used with the photographer's session; Phase 1 does not use a service-role client.
- `photographer_event_summary()` is a narrow SECURITY DEFINER function with an empty search path and explicit `auth.uid()` ownership filter. It returns counts rather than guest identifiers. Download counts count download actions, not individual photos. Fuller metrics arrive in Phase 6.
- Events and photos cannot be directly mutated by browser roles. Phase 2 will provide authenticated, validated server handlers; deletion must coordinate Storage and AWS cleanup before deleting database rows. Never directly delete an auth user or event in production before external cleanup: database cascades cannot remove external resources.
- All four buckets (`originals`, `web`, `thumbnails`, `branding`) are private. Event objects use `<photographer-id>/<event-id>/<photo-id>/<filename>`. Photographer reads check both the owner prefix and event ownership. No anonymous policies exist. Event upload permissions will be signed, scoped server grants in Phase 2.
- Logos use `<photographer-id>/logo.png`. The authenticated upload action validates MIME/size, decodes with a 16-million-pixel limit, rotates, scales to 512px, strips metadata and writes PNG. Storage policies and a profile constraint restrict the path to that photographer. Previews use a one-hour signed URL. Logo replacement overwrites a stable path to avoid orphan files.
- Composite foreign keys prevent cross-event face/match/job references. Download references are checked by a trigger. Family matches include `selfie_index` in the primary key so one indexed face can be retained for multiple searches.
- `consents` and `audit_log` intentionally have no FKs. Update, delete and truncate are blocked by triggers; the service role only gets append/read privileges on these tables. Removal requests have mutable lifecycle status; future handlers must append transitions to `audit_log`. Never put images, selfies or raw IPs in audit metadata.
- `claim_jobs(n, worker_id)` is service-role-only, uses atomic UPDATE plus `FOR UPDATE SKIP LOCKED`, and increments attempts on claim. It accepts 1–100 jobs. Lease recovery, heartbeats, backoff, exhausted-job handling and idempotent processing belong to Phase 3. A claimed job stays running until the worker updates it.
- Default expiry is midnight Asia/Baku on `event_date + 30 days`; explicit expiry is preserved. Changing event_date does not silently extend an existing retention period. Slugs use 12 random hexadecimal characters rather than eight, for a larger collision space; the unique constraint remains authoritative. They are identifiers, not authorization secrets.

Auth implementation follows [Supabase's SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and the [Next.js Proxy convention](https://nextjs.org/docs/app/getting-started/proxy).

## Verify Phase 1

```powershell
npm run lint
npm run typecheck
npm run test:db
npm run build
npm start
```

`test:db` runs the migration SQL using PGlite (embedded Postgres) with minimal fixtures for Supabase's managed auth and storage schemas. It checks owner isolation, anonymous restrictions, storage visibility, cross-event constraints, expiry, append-only records, cascade behavior, duplicate upload keys, family match keys and job claim/retry eligibility. Admin checks cover membership isolation/revocation, private drafts, publishing, restoring, immutable history and optimistic version conflicts. It does **not** replace tests against real Supabase Auth/Storage or a multi-connection worker concurrency test.

Manual integration checks once Supabase is connected:

1. Open `/az`, `/ru` and `/en`; verify language switching and each privacy page.
2. Request a magic link, follow the email and verify the empty dashboard. Reusing an expired/used link should show the translated error.
3. Edit your name, business name and phone; reload and verify persistence. Upload a JPEG/PNG logo smaller than 2 MB; verify its preview URL is signed and the bucket remains private.
4. Sign out and open `/az/dashboard` directly; it must return to `/az/login`.
5. Use two photographer accounts and verify ownership isolation. Do not expose test credentials in the repository.

Database SQL is tested in PGlite. The configured hosted Supabase Auth API responds successfully, but the project does not yet expose the `events` table: apply the migrations before testing login and dashboard data. Live email delivery, session refresh and Storage integration remain unverified. Docker is unavailable in the development environment.

`npm audit` currently reports five high-severity entries in the development-only Next ESLint dependency chain (`braces` / `micromatch` / `fast-glob`). The suggested automatic fix downgrades Next's lint config across major versions; it is not applied. Production dependency audit is checked separately.

## Layout

```text
src/app/[locale]/       localized landing, login, dashboard, profile, legal/contact, admin
src/app/auth/confirm/   magic-link verification and PKCE exchange
src/lib/supabase/       server-only session client
src/messages/          all application copy in AZ/RU/EN
supabase/migrations/   schema, authorization, private storage and site-admin CMS
scripts/test-db.mjs    migration and security regression checks
worker/                Phase 3 worker placeholder
```

## Phases

1. Foundation, schema/RLS, auth, dashboard shell, i18n (complete).
2. Event creation, QR/poster, resumable bulk upload.
3. Worker, derivatives, face indexing, queue recovery and live status.
4. Guest consent, selfie/search, results and downloads.
5. Family search, removal, sessions, rate limits, purge and audit flows.
6. Stats, polish, sample data, matching/E2E tests and deployment guide.

Each phase starts with a plan and approval, and ends with verification and a git commit.

## Modern Product design and site administration

The landing page includes an interactive guest/studio preview, scroll-linked walkthrough, photographer benefits, privacy information, accessible native FAQ disclosures, a responsive navbar and a footer linking to privacy, terms and contact. Motion respects reduced-motion settings. Product mockups are labelled previews: event uploads, face search and downloads remain later-phase features.

The supplied SnapMatch logo and icon remain unchanged in `public/brand`. Metadata uses the selected CMS icon. The existing wedding image is fictional AI-generated imagery, served locally through Next.js image optimization. There are no external image trackers.

The system-admin portal at `/az/admin`, `/ru/admin` or `/en/admin` provides:

- A counts-only platform overview, locale publishing status, missing company details and legal-review reminders.
- Structured editing of navigation, hero, walkthrough, photographer benefits, privacy, FAQ, closing CTA, footer, company/contact/social details, legal text, SEO and branding.
- Section visibility/order and list-item editing. Text is escaped by React; arbitrary HTML/scripts are not accepted.
- Save draft, private saved-draft preview, publish, revision history, restore as a draft and an immutable activity log. Each locale is edited and published independently. Save failures preserve unsaved input; stale versions are rejected instead of overwriting someone else's work.

Company information starts empty. Contact details and social links appear when filled and published. Privacy and terms start as translated drafts awaiting legal review. Image selectors use the three approved assets already in this repository; media uploads and a general page builder are outside this scope.

### Provision the first admin

1. Apply **all four** migrations from `supabase/migrations` in filename order to the intended Supabase project. The site-admin migration is `202610050004_site_admin.sql`; it requires the earlier schema and immutable-record function.
2. Sign in with the intended admin email at `/az/login` to create the Auth account. Do this before granting membership.
3. Set `ADMIN_BOOTSTRAP_EMAIL` in your ignored `.env.local`, then run `npm run admin:bootstrap`. This creates ignored `supabase/bootstrap-admin.local.sql`.
4. Review and run that generated SQL in the project's trusted Supabase SQL Editor. It looks up the existing account and adds enabled membership; it fails if the account does not exist.
5. Open `/az/admin` after signing in. Subsequent magic-link sign-ins route enabled admins to the portal. Use the portal's photographer-dashboard link to reach the ordinary photographer tools.

An email in configuration does not grant access. Membership lives in `system_admins`; authenticated browser roles cannot add or enable themselves. To revoke access, set that account's membership `enabled=false` through a trusted database owner connection. No service-role key is needed by the website CMS.

### CMS access boundaries

Every admin page and action verifies the Supabase user and enabled membership. RLS protects draft, revision and audit reads. Browser roles cannot directly mutate these tables. The guarded `admin_content_change` RPC locks the locale row, checks its expected version and commits the draft/public snapshot, revision and audit entry together. SQL checks document shape/size, while server actions and public rendering enforce the full Zod schema. Missing or invalid public content falls back to translated defaults.

The public `get_site_content(locale)` RPC returns only published website content. This is intentionally public marketing copy; it never exposes drafts, accounts, private event media or guest data. The guarded admin overview returns aggregate counts only. Admin membership adds no direct access to other photographers' private event/guest rows. Revision and audit history survive account deletion and reject updates/deletes/truncation.

### Manual review

1. Review `/az`, `/ru` and `/en` at mobile and desktop widths. Switch the guest/studio preview, select its three steps, scroll the walkthrough, open FAQs, and check mobile navigation, legal/contact links and back-to-top.
2. Anonymous access to `/en/admin` must return to login. A signed-in photographer without enabled admin membership must receive a 404.
3. As the provisioned admin, change and save a headline. Public copy must stay unchanged until Publish. Open the private preview, publish, then reload the public site.
4. Open two editor tabs and save in one; saving the stale tab must report a version conflict and retain its input. Restoring history must alter only the draft until published.
5. Edit contact details in each locale, publish, and verify footer/contact pages. Revoke membership through SQL and verify privileged operations no longer work.

The public app and migration security checks can run locally. Live CMS persistence requires applying the migrations and provisioning the account in the hosted project. Hosted magic-link delivery, Storage and the authenticated admin browser flow are not claimed as verified until that setup is complete.
