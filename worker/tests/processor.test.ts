import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Processor, type Job } from "../src/processor.js";
import { FaceIndex } from "../src/aws.js";

function fixture(
  options: {
    blocked?: boolean;
    stale?: boolean;
    badPath?: boolean;
    expiredAtCommit?: boolean;
    done?: boolean;
  } = {},
) {
  const owner = randomUUID(),
    event = randomUUID(),
    photo = randomUUID();
  const job: Job = {
    id: randomUUID(),
    event_id: event,
    photo_id: photo,
    lease_token: randomUUID(),
    attempts: 1,
  };
  const prefix = `${owner}/${event}/${photo}/`;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const context = {
    done: false,
    blocked: options.blocked || false,
    photo: {
      id: photo,
      original_path: options.badPath
        ? "other/event/photo.jpg"
        : prefix + "original.jpg",
      upload_key: "f".repeat(64),
      bytes: 100,
      web_path: prefix + "web-v1.jpg",
      thumb_path: prefix + "thumb-v1.jpg",
      width: 100,
      height: 100,
      sharpness: 1,
    },
    event: {
      id: event,
      photographer_id: owner,
      watermark_enabled: true,
      face_expires_at: "2099-01-01T00:00:00Z",
      rekognition_collection_id: `snapmatch-${event}`,
    },
  };
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "prepare_photo_job")
        return { data: options.done ? { done: true } : context, error: null };
      if (name === "heartbeat_photo_job")
        return { data: !options.stale, error: null };
      if (name === "complete_photo_job" && options.expiredAtCommit)
        return { data: null, error: { message: "event_unavailable" } };
      return { data: true, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          calls.push({ name: "download", args: { bucket, path } });
          return { data: new Blob(["immutable-image"]), error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const aws = {
    ensureCollection: async () => {
      calls.push({ name: "ensureCollection", args: {} });
    },
    index: async (
      id: string,
      photoId: string,
      bytes: Buffer,
      retry: boolean,
    ) => {
      calls.push({
        name: "index",
        args: { id, photoId, retry, bytes: bytes.toString() },
      });
      return { faces: [], unindexed: 0 };
    },
    remove: async () => {
      calls.push({ name: "remove", args: {} });
    },
    cleanupPhoto: async () => {
      calls.push({ name: "cleanupPhoto", args: {} });
    },
  } as unknown as FaceIndex;
  return { processor: new Processor(db, aws), job, calls };
}
test("checkpointed artifacts are reused on manual retry and never read the original or overwrite storage", async () => {
  const f = fixture();
  await f.processor.run(f.job);
  assert.equal(f.calls.filter((call) => call.name === "download").length, 1);
  assert.equal(
    f.calls.find((call) => call.name === "download")?.args.bucket,
    "web",
  );
  assert.equal(f.calls.find((call) => call.name === "index")?.args.retry, true);
  assert.equal(
    f.calls.find((call) => call.name === "index")?.args.photoId,
    f.job.photo_id,
  );
  assert.ok(f.calls.some((call) => call.name === "complete_photo_job"));
});
test("lost heartbeat fences the worker before any AWS operation or completion", async () => {
  const f = fixture({ stale: true });
  await f.processor.run(f.job);
  assert.ok(
    !f.calls.some((call) =>
      ["index", "complete_photo_job", "fail_photo_job"].includes(call.name),
    ),
  );
});
test("expired jobs reconcile and remove only their own prior faces; never index", async () => {
  const f = fixture({ blocked: true });
  await f.processor.run(f.job);
  assert.ok(f.calls.some((call) => call.name === "cleanupPhoto"));
  assert.ok(!f.calls.some((call) => call.name === "index"));
  assert.equal(
    f.calls.find((call) => call.name === "fail_photo_job")?.args.p_error,
    "event_unavailable",
  );
});
test("expiry during indexing compensates AWS before recording terminal failure", async () => {
  const f = fixture({ expiredAtCommit: true });
  await f.processor.run(f.job);
  const names = f.calls.map((call) => call.name);
  assert.ok(names.indexOf("remove") > names.indexOf("index"));
  assert.ok(names.indexOf("fail_photo_job") > names.indexOf("remove"));
});
test("a cross-event object path fails before downloading or indexing", async () => {
  const f = fixture({ badPath: true });
  await f.processor.run(f.job);
  assert.ok(!f.calls.some((call) => ["download", "index"].includes(call.name)));
  assert.equal(
    f.calls.find((call) => call.name === "fail_photo_job")?.args.p_error,
    "photo_unavailable",
  );
});
test("a committed job recovered after a lost response performs no external operations", async () => {
  const f = fixture({ done: true });
  await f.processor.run(f.job);
  assert.deepEqual(
    f.calls.map((call) => call.name),
    ["prepare_photo_job"],
  );
});
