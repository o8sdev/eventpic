# Testing SnapMatch locally

Start the app with `npm run dev`, or build and run `npm run build` followed by
`npm start`. Open `http://localhost:3000/en/login` and use your email and password.
The first admin's generated password is in the local, Git-ignored
`tmp/admin-login.txt` file. Admin-created photographers need no verification email.

## System admin

After password sign-in, an enabled `system_admins` membership sends you to
`/en/admin`. Membership is provisioned through the trusted bootstrap procedure;
signup metadata and email text alone never grant an admin role.

1. Overview: inspect photographer/event/photo totals and queued/failed jobs.
2. Website editor: change a draft heading, preview it, then publish when ready.
   Company contacts and legal text are still placeholders to complete here.
3. Plans: edit prices, numeric allowances, trial length, benefits, visibility and
   ordering. Save a draft, inspect its preview, then publish. Existing accounts
   retain their assigned version until you explicitly reassign them.
4. Accounts: create a photographer with a name, email and password of at least
   12 characters. No verification email is sent. Open their account,
   inspect actual/reserved storage and usage, then
   assign a plan and access end date with a reason. These are manual access grants;
   they do not charge a card. Test scheduling and temporary capacity separately.
5. History/activity: check published versions and the audit entry for each change.

The admin sidebar's photographer-workspace link also opens your own events. This
is useful for a tour, but cannot prove that ordinary accounts are denied admin
access.

## Separate photographer

Create the photographer in Admin → Accounts using another email and a password
you choose. Open a separate browser profile for that login. Keep the admin
session open so you can compare both roles without signing each other out.

1. Sign in and verify `/en/admin` is inaccessible (404).
2. Complete the profile and upload a logo.
3. Open Plan & usage to inspect the trial and remaining allowances.
4. Create a test event, edit settings, download its QR PNG and A5 poster.
5. Upload a small batch of JPEGs. Re-select the same files to check deduplication.
   Refresh and re-select interrupted files to continue them. Uploaded files count
   once against the monthly acceptance allowance; unused reservations hold storage.
6. Close/reopen the event and compare the active-event count. From the admin
   account, assign another plan, then refresh Plan & usage to see the new limits.
7. With worker credentials configured, start `npm run worker:start`; check photos
   progress to indexed, then inspect previews and face counts. A blocked worker
   leaves uploads queued; it does not mean the uploads failed.

## Current limits

- Database, Auth and private Storage are connected; migrations are deployed.
- The worker needs `SUPABASE_SERVICE_ROLE_KEY` and valid AWS credentials/role in
  `eu-central-1`. Keep them only in `.env.local` or the host's secret store.
- Admin-created accounts skip email confirmation. Supabase's global confirmation
  setting remains available for any future public signup flow. Custom SMTP is
  still needed before using email invitations or password-reset emails broadly.
- Guest consent, camera/search/results/downloads, family search, removals, purge
  execution and end-to-end event deletion are subsequent phases. The current QR
  destination is a placeholder; it cannot yet demonstrate face search.
- Card payments, subscriptions and provider billing are not integrated. Search
  and authorised-download metering is ready for guest handlers, but those handlers
  are not built yet.

Automated checks: `npm run test:db`, `npm run test:billing`, `npm run test:worker`,
`npm run test:events`, `npm run test:site`, `npm run lint`, `npm run typecheck`,
`npm run build`. With the local app running: `npm run check:setup` and
`npm run test:auth`. Passing these does not substitute for real sign-in and AWS
photo-processing tests.

`npm run test:access` is an opt-in live integration check against localhost and
the configured Supabase project. It reads the ignored admin handoff, creates one
disposable `example.invalid` photographer through the admin action, verifies role
isolation, then revokes its session and deletes that exact test account. Its audit
entries deliberately remain. No test emails are sent. It signs out only its own
admin session, leaving browser sessions intact.
