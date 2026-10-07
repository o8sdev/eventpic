import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FaceIndex } from "./aws.js";
import { LeaseLost, ProcessingError, failure } from "./errors.js";
import { MAX_INDEX_BYTES, MAX_ORIGINAL_BYTES, processImage } from "./images.js";

export const jobSchema = z.object({
  id: z.uuid(),
  event_id: z.uuid(),
  photo_id: z.uuid(),
  lease_token: z.uuid(),
  attempts: z.number().int().positive(),
});
export type Job = z.infer<typeof jobSchema>;
const contextSchema = z.object({
  done: z.literal(false),
  blocked: z.boolean(),
  photo: z.object({
    id: z.uuid(),
    original_path: z.string(),
    upload_key: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().min(3).max(MAX_ORIGINAL_BYTES),
    web_path: z.string().nullable(),
    thumb_path: z.string().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    sharpness: z.number().nullable(),
  }),
  event: z.object({
    id: z.uuid(),
    photographer_id: z.uuid(),
    watermark_enabled: z.boolean(),
    face_expires_at: z.iso.datetime({ offset: true }),
    rekognition_collection_id: z.string().nullable(),
  }),
});

export class Processor {
  constructor(
    private db: SupabaseClient,
    private aws: FaceIndex,
  ) {}
  async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.db.rpc(name, args);
    if (error) {
      if (error.message === "lease_lost") throw new LeaseLost();
      if (["event_unavailable", "photo_unavailable"].includes(error.message))
        throw new ProcessingError(error.message, true);
      throw new ProcessingError("processing_error");
    }
    return data;
  }
  private async download(bucket: string, path: string, max: number) {
    const { data, error } = await this.db.storage.from(bucket).download(path);
    if (error || !data) throw new ProcessingError("storage_error");
    if (data.size > max) throw new ProcessingError("image_too_large", true);
    return Buffer.from(await data.arrayBuffer());
  }
  private async immutable(
    bucket: string,
    path: string,
    bytes: Buffer,
    max: number,
  ) {
    const { error } = await this.db.storage
      .from(bucket)
      .upload(path, bytes, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "3600",
      });
    if (
      error &&
      !["409", "400"].includes(
        String((error as { statusCode?: string }).statusCode),
      )
    )
      throw new ProcessingError("storage_error");
    // Always read back: an earlier attempt may have won the immutable write.
    return this.download(bucket, path, max);
  }
  async run(job: Job) {
    const args = { p_job: job.id, p_token: job.lease_token };
    const controller = new AbortController();
    let heartbeat: Promise<void> | undefined;
    const renew = async () => {
      try {
        if (!(await this.rpc("heartbeat_photo_job", args))) controller.abort();
      } catch {
        controller.abort();
      }
    };
    const timer = setInterval(() => {
      if (!heartbeat)
        heartbeat = renew().finally(() => {
          heartbeat = undefined;
        });
    }, 30000);
    const assertLease = async () => {
      if (controller.signal.aborted) throw new LeaseLost();
      await renew();
      if (controller.signal.aborted) throw new LeaseLost();
    };
    try {
      const raw = await this.rpc("prepare_photo_job", args);
      if (raw?.done === true) return;
      const { photo, event, blocked } = contextSchema.parse(raw);
      const prefix = `${event.photographer_id}/${event.id}/${photo.id}/`;
      if (
        event.id !== job.event_id ||
        photo.id !== job.photo_id ||
        photo.original_path !== `${prefix}original.jpg` ||
        (event.rekognition_collection_id !== null &&
          event.rekognition_collection_id !== `snapmatch-${event.id}`)
      )
        throw new ProcessingError("photo_unavailable", true);
      const collection = event.rekognition_collection_id;
      const cleanupBlocked = async () => {
        await assertLease();
        if (collection)
          await this.aws.cleanupPhoto(collection, photo.id, controller.signal);
        throw new ProcessingError("event_unavailable", true);
      };
      if (blocked) await cleanupBlocked();
      if (!collection) throw new ProcessingError("photo_unavailable", true);
      let web: Buffer;
      if (photo.web_path && photo.thumb_path) {
        if (
          photo.web_path !== `${prefix}web-v1.jpg` ||
          photo.thumb_path !== `${prefix}thumb-v1.jpg`
        )
          throw new ProcessingError("photo_unavailable", true);
        web = await this.download("web", photo.web_path, MAX_INDEX_BYTES);
      } else {
        const original = await this.download(
          "originals",
          photo.original_path,
          MAX_ORIGINAL_BYTES,
        );
        if (
          original.length !== photo.bytes ||
          createHash("sha256").update(original).digest("hex") !==
            photo.upload_key
        )
          throw new ProcessingError("fingerprint_mismatch", true);
        const images = await processImage(original, event.watermark_enabled);
        await assertLease();
        web = await this.immutable(
          "web",
          `${prefix}web-v1.jpg`,
          images.web,
          MAX_INDEX_BYTES,
        );
        await this.immutable(
          "thumbnails",
          `${prefix}thumb-v1.jpg`,
          images.thumb,
          MAX_INDEX_BYTES,
        );
        await this.rpc("checkpoint_photo_assets", {
          ...args,
          p_width: images.width,
          p_height: images.height,
          p_sharpness: images.sharpness,
        });
      }
      await assertLease();
      // Recheck the database immediately before AWS, including close/expiry changes.
      const latest = await this.rpc("prepare_photo_job", args);
      if (latest.blocked) await cleanupBlocked();
      await this.aws.ensureCollection(collection, controller.signal);
      const result = await this.aws.index(
        collection,
        photo.id,
        web,
        job.attempts > 1 || photo.web_path !== null,
        controller.signal,
      );
      await assertLease();
      try {
        await this.rpc("complete_photo_job", {
          ...args,
          p_faces: result.faces,
          p_unindexed: result.unindexed,
        });
      } catch (error) {
        // Expiry/closing during the AWS request must not leave new searchable faces.
        if (
          error instanceof ProcessingError &&
          error.code === "event_unavailable"
        )
          await this.aws.remove(collection, result.faces);
        throw error;
      }
      console.log(
        JSON.stringify({
          event: "photo_processed",
          job: job.id,
          faces: result.faces.length,
        }),
      );
    } catch (error) {
      if (error instanceof LeaseLost || controller.signal.aborted) {
        console.warn(JSON.stringify({ event: "lease_lost", job: job.id }));
        return;
      }
      const issue = failure(error);
      await this.rpc("fail_photo_job", {
        ...args,
        p_error: issue.code,
        p_permanent: issue.permanent,
      });
      // Never log provider error bodies, image bytes, signed URLs, or credentials.
      console.warn(
        JSON.stringify({
          event: "photo_failed",
          job: job.id,
          code: issue.code,
        }),
      );
    } finally {
      clearInterval(timer);
      if (heartbeat) await heartbeat;
    }
  }
}
