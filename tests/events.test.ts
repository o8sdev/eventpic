import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import jsQR from "jsqr";
import { PDFDocument } from "pdf-lib";
import {
  eventSchema,
  dateSchema,
  defaultExpiry,
  bakuDate,
  uploadSchema,
  MAX_PHOTO_BYTES,
} from "../src/lib/events/schema";
import { eventPoster, qrPng } from "../src/lib/events/poster";
const event = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Baku wedding",
  event_date: "2026-10-05",
  venue: "Baku",
  languages: ["en"],
  default_locale: "en",
  allow_original_download: false,
  watermark_enabled: true,
  expiry: "",
};
test("event dates and guest settings reject impossible or inconsistent values", () => {
  assert.equal(eventSchema.safeParse(event).success, true);
  for (const value of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-1-05"])
    assert.equal(dateSchema.safeParse(value).success, false);
  assert.equal(
    eventSchema.safeParse({ ...event, languages: ["az"], default_locale: "ru" })
      .success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({ ...event, languages: ["en", "en"] }).success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({ ...event, expiry: "2026-10-04" }).success,
    false,
  );
  assert.equal(defaultExpiry("2024-01-31"), "2024-03-01");
  assert.equal(bakuDate("2026-11-03T20:00:00Z"), "2026-11-04");
});
test("upload metadata requires a full fingerprint, bounded bytes and a safe filename", () => {
  const input = {
    upload_key: "a".repeat(64),
    original_filename: "Şəkil 01.jpg",
    bytes: 1024,
  };
  assert.equal(uploadSchema.safeParse(input).success, true);
  for (const change of [
    { upload_key: "short" },
    { bytes: MAX_PHOTO_BYTES + 1 },
    { bytes: 0 },
    { original_filename: "bad\nname.jpg" },
  ])
    assert.equal(
      uploadSchema.safeParse({ ...input, ...change }).success,
      false,
    );
});
test("QR pixels decode to the exact guest URL", async () => {
  const url = "https://snapmatch.example/e/1234abcdef56";
  const { data, info } = await sharp(await qrPng(url))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  assert.equal(result?.data, url);
});
test("English posters are single A5 pages and support Unicode event titles", async () => {
  for (const title of [
    "Əli və Aysel — Bakı",
    "Свадьба Али и Айсель",
    "Ali & Aysel",
  ]) {
    const bytes = await eventPoster({
      title,
      venue: "Baku",
      date: "2026-10-05",
      expiry: "2026-11-03T20:00:00Z",
      url: "https://snapmatch.example/e/1234abcdef56",
      locale: "en",
    });
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
    const { width, height } = doc.getPage(0).getSize();
    assert.ok(Math.abs(width - 419.528) < 0.01);
    assert.ok(Math.abs(height - 595.276) < 0.01);
    assert.match(doc.getTitle()!, /SnapMatch/);
    assert.ok(bytes.length > 10000);
  }
});
