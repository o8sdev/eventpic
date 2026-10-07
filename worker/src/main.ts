import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { services } from "./services.js";
import { Processor, jobSchema } from "./processor.js";

async function main() {
  const { settings, db, aws } = services();
  sharp.concurrency(1);
  sharp.cache({ memory: 64 });
  const processor = new Processor(db, aws);
  const active = new Set<Promise<void>>();
  let stopping = false;
  const wake = new AbortController();
  const stop = () => {
    stopping = true;
    wake.abort();
    console.log(
      JSON.stringify({ event: "worker_draining", jobs: active.size }),
    );
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(
    JSON.stringify({
      event: "worker_started",
      concurrency: settings.WORKER_CONCURRENCY,
      region: settings.AWS_REGION,
    }),
  );
  try {
    while (!stopping) {
      try {
        const slots = settings.WORKER_CONCURRENCY - active.size;
        if (slots > 0) {
          const jobs = await processor.rpc("claim_jobs", {
            n: slots,
            worker_id: settings.workerId,
          });
          for (const raw of jobs || []) {
            const job = jobSchema.parse(raw);
            const task = processor
              .run(job)
              .catch(() => {
                console.error(
                  JSON.stringify({ event: "job_update_failed", job: job.id }),
                );
              })
              .finally(() => active.delete(task));
            active.add(task);
          }
        }
      } catch {
        console.error(JSON.stringify({ event: "queue_unavailable" }));
      }
      await delay(settings.WORKER_POLL_MS, undefined, {
        signal: wake.signal,
      }).catch(() => {});
    }
  } finally {
    await Promise.allSettled(active);
    aws.client.destroy();
  }
}
main().catch(() => {
  console.error(
    "Worker startup failed. Check configuration with npm run check.",
  );
  process.exitCode = 1;
});
