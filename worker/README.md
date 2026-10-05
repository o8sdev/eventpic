# Worker (Phase 3)

The separate Node.js process will live here. It will use sharp and AWS SDK v3,
poll `claim_jobs(n, worker_id)` with the service role, renew/recover job leases,
and implement idempotent processing with bounded retries and backoff.

Use `AWS_REGION=eu-central-1`. Never place service/AWS credentials in public Next.js variables.
This directory does not yet contain an executable worker.
