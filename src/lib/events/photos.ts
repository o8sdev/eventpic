import { z } from "zod";

export const photoStatuses = [
  "pending_upload",
  "uploaded",
  "processing",
  "indexed",
  "failed",
] as const;
export const photoPageSchema = z.object({
  count: z.number().int().nonnegative(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  photos: z
    .array(
      z.object({
        id: z.uuid(),
        original_filename: z.string(),
        bytes: z.number().nullable(),
        face_count: z.number(),
        unindexed_face_count: z.number(),
        status: z.enum(photoStatuses),
        error: z.string().nullable(),
        thumbnail: z.string().nullable(),
        preview: z.string().nullable(),
        has_preview: z.boolean(),
        job: z
          .object({
            status: z.string(),
            attempts: z.number(),
            max_attempts: z.number(),
            run_after: z.string(),
          })
          .nullable(),
      }),
    )
    .max(48),
});
export type PhotoPage = z.infer<typeof photoPageSchema>;
