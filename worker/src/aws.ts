import {
  CreateCollectionCommand,
  DescribeCollectionCommand,
  IndexFacesCommand,
  ListFacesCommand,
  DeleteFacesCommand,
  RekognitionClient,
  type Face,
} from "@aws-sdk/client-rekognition";
import { z } from "zod";
import { ProcessingError } from "./errors.js";

export const faceSchema = z.object({
  face_id: z.uuid(),
  box_left: z.number().min(0).max(1),
  box_top: z.number().min(0).max(1),
  box_width: z.number().positive().max(1),
  box_height: z.number().positive().max(1),
  confidence: z.number().min(0).max(100),
});
export type IndexedFace = z.infer<typeof faceSchema>;
export function normalizeFace(face: Face): IndexedFace {
  const box = face.BoundingBox;
  if (
    !box ||
    box.Left === undefined ||
    box.Top === undefined ||
    box.Width === undefined ||
    box.Height === undefined
  )
    throw new ProcessingError("aws_unavailable");
  // AWS can return boxes partly outside the image; store their visible bounds.
  const left = Math.max(0, box.Left),
    top = Math.max(0, box.Top);
  return faceSchema.parse({
    face_id: face.FaceId,
    box_left: left,
    box_top: top,
    box_width: Math.min(1, box.Left + box.Width) - left,
    box_height: Math.min(1, box.Top + box.Height) - top,
    confidence: face.Confidence,
  });
}
export class FaceIndex {
  constructor(public client: RekognitionClient) {}
  async ensureCollection(id: string, signal: AbortSignal) {
    try {
      await this.client.send(
        new DescribeCollectionCommand({ CollectionId: id }),
        { abortSignal: signal },
      );
    } catch (error) {
      if ((error as Error).name !== "ResourceNotFoundException") throw error;
      try {
        await this.client.send(
          new CreateCollectionCommand({ CollectionId: id }),
          { abortSignal: signal },
        );
      } catch (createError) {
        if ((createError as Error).name !== "ResourceAlreadyExistsException")
          throw createError;
      }
    }
  }
  async index(
    id: string,
    photoId: string,
    bytes: Buffer,
    retry: boolean,
    signal: AbortSignal,
  ) {
    // Reconcile a lost AWS response before reindexing. This scan only runs on
    // retries; ListFaces has no ExternalImageId filter.
    if (retry) {
      const existing = await this.forPhoto(id, photoId, signal);
      if (existing.length) return { faces: existing, unindexed: 0 };
    }
    const result = await this.client.send(
      new IndexFacesCommand({
        CollectionId: id,
        ExternalImageId: photoId,
        Image: { Bytes: bytes },
        MaxFaces: 100,
        QualityFilter: "AUTO",
        DetectionAttributes: ["DEFAULT"],
      }),
      { abortSignal: signal },
    );
    return {
      faces: (result.FaceRecords || []).map((item) =>
        normalizeFace(item.Face!),
      ),
      unindexed: Math.min(100, result.UnindexedFaces?.length || 0),
    };
  }
  async forPhoto(id: string, photoId: string, signal: AbortSignal) {
    let next: string | undefined;
    const faces: IndexedFace[] = [];
    do {
      const page = await this.client.send(
        new ListFacesCommand({
          CollectionId: id,
          MaxResults: 4096,
          NextToken: next,
        }),
        { abortSignal: signal },
      );
      for (const face of page.Faces || [])
        if (face.ExternalImageId === photoId) faces.push(normalizeFace(face));
      next = page.NextToken;
    } while (next);
    return faces;
  }
  async cleanupPhoto(id: string, photoId: string, signal: AbortSignal) {
    try {
      await this.remove(id, await this.forPhoto(id, photoId, signal));
    } catch (error) {
      if ((error as Error).name !== "ResourceNotFoundException") throw error;
    }
  }
  async remove(id: string, faces: IndexedFace[]) {
    if (faces.length)
      await this.client.send(
        new DeleteFacesCommand({
          CollectionId: id,
          FaceIds: faces.map((face) => face.face_id),
        }),
      );
  }
}
