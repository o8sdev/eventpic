import test from "node:test";
import assert from "node:assert/strict";
import {
  RekognitionClient,
  IndexFacesCommand,
  ListFacesCommand,
  DescribeCollectionCommand,
  CreateCollectionCommand,
} from "@aws-sdk/client-rekognition";
import { FaceIndex } from "../src/aws.js";

const face = {
  FaceId: "11111111-1111-4111-8111-111111111111",
  ExternalImageId: "photo",
  Confidence: 99,
  BoundingBox: { Left: 0.1, Top: 0.2, Width: 0.3, Height: 0.4 },
};
test("reconciles a lost IndexFaces response by ExternalImageId across all pages", async () => {
  const calls: unknown[] = [];
  const client = {
    send: async (command: ListFacesCommand) => {
      calls.push(command);
      assert.ok(command instanceof ListFacesCommand);
      return command.input.NextToken
        ? { Faces: [face] }
        : {
            Faces: [{ ...face, ExternalImageId: "other-photo" }],
            NextToken: "next",
          };
    },
  } as unknown as RekognitionClient;
  const result = await new FaceIndex(client).index(
    "event-only",
    "photo",
    Buffer.from("jpeg"),
    true,
    new AbortController().signal,
  );
  assert.equal(calls.length, 2);
  assert.equal(result.faces.length, 1);
  assert.equal(result.faces[0].face_id, face.FaceId);
});
test("first indexing uses the event collection, photo ID, AUTO quality, and 100 faces", async () => {
  const client = {
    send: async (command: IndexFacesCommand) => {
      assert.ok(command instanceof IndexFacesCommand);
      assert.equal(command.input.CollectionId, "event-only");
      assert.equal(command.input.ExternalImageId, "photo");
      assert.equal(command.input.QualityFilter, "AUTO");
      assert.equal(command.input.MaxFaces, 100);
      assert.deepEqual(command.input.DetectionAttributes, ["DEFAULT"]);
      return { FaceRecords: [], UnindexedFaces: [{}] };
    },
  } as unknown as RekognitionClient;
  const result = await new FaceIndex(client).index(
    "event-only",
    "photo",
    Buffer.from("jpeg"),
    false,
    new AbortController().signal,
  );
  assert.equal(result.faces.length, 0);
  assert.equal(result.unindexed, 1);
});
test("concurrent collection creation accepts AlreadyExists but propagates access errors", async () => {
  const client = {
    send: async (command: unknown) => {
      const error = new Error();
      error.name =
        command instanceof DescribeCollectionCommand
          ? "ResourceNotFoundException"
          : "ResourceAlreadyExistsException";
      assert.ok(
        command instanceof DescribeCollectionCommand ||
          command instanceof CreateCollectionCommand,
      );
      throw error;
    },
  } as unknown as RekognitionClient;
  await new FaceIndex(client).ensureCollection(
    "event-only",
    new AbortController().signal,
  );
  const denied = {
    send: async () => {
      const error = new Error();
      error.name = "AccessDeniedException";
      throw error;
    },
  } as unknown as RekognitionClient;
  await assert.rejects(
    new FaceIndex(denied).ensureCollection(
      "event-only",
      new AbortController().signal,
    ),
    { name: "AccessDeniedException" },
  );
});
