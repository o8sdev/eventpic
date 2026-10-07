import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  laplacianVariance,
  processImage,
  MAX_INDEX_BYTES,
} from "../src/images.js";
import { normalizeFace } from "../src/aws.js";
import { failure } from "../src/errors.js";

test("auto-orients JPEG, bounds web/thumb sizes, removes EXIF including location, and preserves original", async () => {
  const original = await sharp({
    create: { width: 2600, height: 1800, channels: 3, background: "#3874ba" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Artist: "Test fixture" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "40/1 0/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "49/1 0/1 0/1",
      },
    })
    .toBuffer();
  const before = Buffer.from(original);
  const result = await processImage(original, false);
  assert.equal(result.width, 1800);
  assert.equal(result.height, 2600);
  const web = await sharp(result.web).metadata(),
    thumb = await sharp(result.thumb).metadata();
  assert.equal(web.height, 2048);
  assert.equal(thumb.height, 400);
  for (const meta of [web, thumb]) {
    assert.equal(meta.exif, undefined);
    assert.equal(meta.orientation, undefined);
    assert.equal(meta.xmp, undefined);
    assert.equal(meta.icc, undefined);
  }
  assert.ok((await sharp(original).metadata()).exif);
  assert.deepEqual(original, before);
  assert.ok(result.web.length < MAX_INDEX_BYTES);
  assert.ok(Number.isFinite(result.sharpness));
});
test("watermark changes delivery images; repeated processing produces identical bytes", async () => {
  const original = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#ddd" },
  })
    .jpeg()
    .toBuffer();
  const clean = await processImage(original, false),
    marked = await processImage(original, true),
    repeat = await processImage(original, true);
  assert.notDeepEqual(clean.web, marked.web);
  assert.notDeepEqual(clean.thumb, marked.thumb);
  assert.deepEqual(marked.web, repeat.web);
  assert.deepEqual(marked.thumb, repeat.thumb);
});
test("rejects spoofed JPEG headers and invalid files before AWS", async () => {
  await assert.rejects(
    processImage(Buffer.from("hello"), false),
    /invalid_image/,
  );
  await assert.rejects(
    processImage(Buffer.from([255, 216, 255, 1, 2]), false),
    /invalid_image/,
  );
});
test("Laplacian variance distinguishes a flat image and edges", () => {
  const flat = new Uint8Array(64).fill(100),
    edges = new Uint8Array(64).map((_, i) => (i % 8 < 4 ? 0 : 255));
  assert.equal(laplacianVariance(flat, 8, 8), 0);
  assert.ok(laplacianVariance(edges, 8, 8) > 1000);
  assert.equal(laplacianVariance(new Uint8Array(1), 1, 1), 0);
});
test("clips AWS boxes crossing image edges and classifies errors without exposing messages", () => {
  const face = normalizeFace({
    FaceId: "11111111-1111-4111-8111-111111111111",
    Confidence: 99,
    BoundingBox: { Left: -0.1, Top: 0.1, Width: 0.3, Height: 0.2 },
  });
  assert.equal(face.box_left, 0);
  assert.ok(Math.abs(face.box_width - 0.2) < 1e-6);
  assert.throws(() => normalizeFace({ FaceId: "bad", Confidence: 99 }));
  const error = new Error("private provider details");
  error.name = "AccessDeniedException";
  assert.equal(failure(error).code, "aws_access");
  assert.equal(failure(error).message, "aws_access");
});
