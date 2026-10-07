import sharp from "sharp";
import { ProcessingError } from "./errors.js";

export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;
export const MAX_INDEX_BYTES = 5_000_000;
export function laplacianVariance(
  pixels: Uint8Array,
  width: number,
  height: number,
) {
  if (width < 3 || height < 3) return 0;
  let count = 0,
    sum = 0,
    squares = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value =
        pixels[i - 1] +
        pixels[i + 1] +
        pixels[i - width] +
        pixels[i + width] -
        4 * pixels[i];
      count++;
      sum += value;
      squares += value * value;
    }
  return Math.max(0, squares / count - (sum / count) ** 2);
}
export async function sharpness(image: Buffer) {
  const { data, info } = await sharp(image)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return laplacianVariance(data, info.width, info.height);
}
function watermark(width: number, height: number) {
  const w = Math.max(1, Math.min(width, Math.round(width * 0.22)));
  const h = Math.max(1, Math.min(height, Math.round(w * 0.26)));
  // Static text only; no user-controlled SVG, external URLs or metadata.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" rx="${h * 0.15}" fill="#111827" fill-opacity=".34"/><text x="50%" y="68%" text-anchor="middle" font-family="sans-serif" font-size="${h * 0.55}" fill="white" fill-opacity=".85">SnapMatch</text></svg>`,
  );
}
export async function processImage(original: Buffer, watermarked: boolean) {
  if (original.length > MAX_ORIGINAL_BYTES)
    throw new ProcessingError("image_too_large", true);
  if (original[0] !== 255 || original[1] !== 216 || original[2] !== 255)
    throw new ProcessingError("invalid_image", true);
  try {
    const input = sharp(original, {
      limitInputPixels: 120_000_000,
      failOn: "error",
    }).timeout({ seconds: 60 });
    const meta = await input.metadata();
    if (meta.format !== "jpeg" || !meta.width || !meta.height)
      throw new Error("Invalid JPEG");
    const swapped = [5, 6, 7, 8].includes(meta.orientation || 1);
    const width = swapped ? meta.height : meta.width;
    const height = swapped ? meta.width : meta.height;
    // sharp strips metadata by default. Auto-orient before removing EXIF.
    const clean = await input
      .rotate()
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const score = await sharpness(clean);
    const dimensions = await sharp(clean).metadata();
    const web = watermarked
      ? await sharp(clean)
          .composite([
            {
              input: watermark(dimensions.width!, dimensions.height!),
              gravity: "southeast",
            },
          ])
          .jpeg({ quality: 82 })
          .toBuffer()
      : clean;
    if (web.length >= MAX_INDEX_BYTES)
      throw new ProcessingError("image_too_large", true);
    const thumb = await sharp(web)
      .resize(400, 400, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { web, thumb, width, height, sharpness: score };
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    throw new ProcessingError("invalid_image", true);
  }
}
