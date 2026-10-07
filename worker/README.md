# SnapMatch photo worker (Phase 3)

A separate, long-running Node.js process. It claims `process_photo` jobs from
Supabase and writes private previews and event-scoped Rekognition face records.
Use Node 22.14+; run separately from Next.js and Vercel.

## Start locally

From the repository root:

```powershell
npm ci --prefix worker
npm run worker:check
npm run worker:build
npm run worker:start
```

Use `npm run worker:dev` during development, and `npm run dev` in a separate
terminal for Next.js. Both development and compiled workers load the root
`.env.local` without overriding existing environment variables. Do not overwrite
an existing environment file.

- `NEXT_PUBLIC_SUPABASE_URL`: same project as the web app.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role/secret key from project API
  settings. Never use a publishable key here or expose this key to browsers.
- `AWS_REGION=eu-central-1`: validated and fixed for this application.
- Local AWS credentials: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, plus
  `AWS_SESSION_TOKEN` for temporary credentials. Production should use a dedicated
  host IAM role via the AWS default credential chain.
- `WORKER_CONCURRENCY=2`: 1–4 jobs. Start with 2 and at least 1 GB RAM; large camera
  files may need more. Decoding is limited to 120 million pixels and 50 MB. sharp
  uses one thread per image and a 64 MB cache.
- `WORKER_POLL_MS=5000`: 1,000–60,000 ms.

The check command is read-only: service access to the Phase 3 schema, private
buckets, and an authenticated DescribeCollection call. It does not print secrets.
A passing read does not verify CreateCollection/IndexFaces; test an event upload.

## AWS permissions

Use a dedicated principal with this policy, substituting your AWS account ID.
No S3 access or administrator policy is needed. Collection IDs are always
`snapmatch-<event UUID>`.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "rekognition:CreateCollection", "rekognition:DescribeCollection",
      "rekognition:IndexFaces", "rekognition:ListFaces", "rekognition:DeleteFaces"
    ],
    "Resource": "arn:aws:rekognition:eu-central-1:YOUR_ACCOUNT_ID:collection/snapmatch-*"
  }]
}
```

DeleteFaces compensates if an event closes/expires during indexing. Collection
deletion and scheduled purges are later-phase work; they must exist before
production guest search is enabled.

## Processing and privacy

1. Claim only as many jobs as there are free worker slots. Unsupported
   `delete_event` and `purge_expired` jobs stay queued for their later workers.
2. Validate event/photo paths and expiry. Download the original and verify its
   byte count and SHA-256 fingerprint against the upload reservation.
3. Decode/rotate JPEG, bound the web version to 2048px long edge at quality 82,
   and create a 400px thumbnail. sharp strips EXIF/GPS, XMP and ICC metadata by
   default. The original is unchanged. Optional watermarking adds a subtle static
   SnapMatch label to both delivery images, with no user-controlled SVG or URLs.
4. Compute variance of a 4-neighbour Laplacian on grayscale pixels bounded to
   512px before watermarking. This is a relative sharpness ranking signal.
5. Write immutable `web-v1.jpg` and `thumb-v1.jpg` objects and checkpoint metrics.
   Never overwrite these artifacts on retries, including after a worker upgrade.
6. Index the persisted web bytes (strictly under 5 MB), ExternalImageId = photo
   UUID, MaxFaces 100, QualityFilter AUTO, DEFAULT attributes only. Save face IDs,
   visible bounding boxes and confidence. Zero usable faces is a successful result.
7. Atomically save face records, counts, photo status and job completion under the
   lease token. Logs contain job IDs, counts and allowlisted codes, never images,
   face IDs, raw provider errors, credentials or signed URLs.

The photographer gallery polls authenticated owner-scoped routes every 5 seconds
while visible. Preview URLs last one hour, remain stable between polls, and renew
after 50 minutes or when new previews appear. These routes use the photographer
session and RLS, not the service key. Retry POSTs also check Origin. Queue payloads
and face identifiers never reach the browser.

## Reliability and operations

- `FOR UPDATE SKIP LOCKED` claims have a fresh random token and five-minute lease,
  renewed every 30 seconds. Checkpoint/completion/failure reject expired tokens.
  Multiple worker processes may run concurrently.
- Claims recover expired leases. Retry delays are 30, 60, 120, 240… seconds, capped
  at one hour. After five attempts (default), the job is `dead` and photo `failed`.
  Invalid images and ineligible events fail permanently.
- Owners can retry dead jobs after a one-minute cooldown for open, unexpired
  events. Artifacts persist; reconciliation still runs after attempts reset.
- AWS and Postgres cannot share a transaction: this is at-least-once processing.
  Stable bytes/collection/ExternalImageId use AWS deduplication. Retries paginate
  ListFaces and match the exact photo UUID to recover a lost AWS response. The
  event-wide scan happens only during retries, not normal first processing.
- Expiry/closure racing indexing triggers removal of that photo's new faces.
  Blocked retries reconcile orphan faces again before becoming dead. If AWS
  cleanup exhausts retries, operator intervention is needed; the later collection
  purge is also necessary for production retention.
- A crash between Storage and checkpoint is safe: upload conflicts read back the
  immutable object. A photo already marked indexed is not indexed again.
- SIGTERM/SIGINT stops claiming and drains jobs while maintaining leases. Allow
  at least five minutes of shutdown grace; forced stops recover after lease expiry.
  Deploy schema first, then new workers; do not migrate under old running workers.
- The service key bypasses RLS, so the worker independently checks IDs and paths.
  It does not consume browser-provided paths/collections in job payloads. Worker
  RPCs are SECURITY INVOKER and service-role-only. Photographer status/retry RPCs
  have empty search paths and explicit `auth.uid()` ownership checks.

## Verification

```powershell
npm run test:db
npm run test:worker
npm run worker:build
npm run worker:check
```

PGlite tests exercise SQL authorization, leases, fencing, recovery, atomic results,
retry limits/cooldown and expiry. Worker tests run real sharp processing with
mocked AWS/network boundaries. They do not establish hosted Auth/Storage/AWS
integration or real multi-process contention.

Live acceptance: sign in, create a future/unexpired event, upload a JPEG with faces,
and watch `Queued → Processing → Ready`. Open its preview and check its face count.
Upload a landscape (Ready, zero faces) and a corrupt JPEG-header file (localized
permanent failure). For a recovery drill, stop the worker mid-job, let its lease
expire, then restart; the photo should appear once. Use a disposable test event.

The hosted migration was applied on 2026-10-07. At implementation time the local
service/AWS key values were empty. Live processing remains pending credentials
and a verified photographer session.

References: [IndexFaces](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_IndexFaces.html),
[ListFaces](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_ListFaces.html),
[sharp metadata](https://sharp.pixelplumbing.com/api-output/),
[Supabase signed URLs](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).
