import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { messages, type Locale } from "@/lib/i18n";
export async function qrPng(url: string) {
  return QRCode.toBuffer(url, {
    type: "png",
    width: 1024,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#101c38", light: "#ffffff" },
  });
}
function lines(text: string, font: PDFFont, size: number, width: number) {
  const output: string[] = [];
  let line = "";
  for (const word of text.replace(/[\r\n\t]/g, " ").split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) {
      output.push(line);
      line = "";
    }
    for (const char of word) {
      if (font.widthOfTextAtSize(line + char, size) > width) {
        output.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) output.push(line);
  return output;
}
function capped(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
  max: number,
) {
  const output = lines(text, font, size, width);
  if (output.length <= max) return output;
  const result = output.slice(0, max);
  let last = result[max - 1];
  while (last && font.widthOfTextAtSize(last + "…", size) > width)
    last = last.slice(0, -1);
  result[max - 1] = last + "…";
  return result;
}
export async function eventPoster(input: {
  title: string;
  venue: string | null;
  date: string;
  expiry: string;
  url: string;
  locale: Locale;
}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(
      path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"),
    ),
    { subset: true },
  );
  const supported = new Set(font.getCharacterSet());
  const clean = (text: string) =>
    Array.from(text, (char) =>
      supported.has(char.codePointAt(0)!) ? char : "?",
    ).join("");
  const page = doc.addPage([(148 / 25.4) * 72, (210 / 25.4) * 72]);
  const { width, height } = page.getSize();
  const t = messages[input.locale].phase2;
  const ink = rgb(0.063, 0.11, 0.22),
    muted = rgb(0.4, 0.45, 0.55),
    purple = rgb(0.4, 0.29, 0.78);
  page.drawRectangle({ x: 0, y: height - 5, width, height: 5, color: purple });
  const logo = await doc.embedPng(
    await readFile(path.join(process.cwd(), "public/brand/snapmatch-logo.png")),
  );
  const logoSize = logo.scaleToFit(160, 54);
  page.drawImage(logo, {
    x: (width - logoSize.width) / 2,
    y: height - 77,
    width: logoSize.width,
    height: logoSize.height,
  });
  const center = (text: string, y: number, size: number, color = ink) =>
    page.drawText(clean(text), {
      x: (width - font.widthOfTextAtSize(clean(text), size)) / 2,
      y,
      size,
      font,
      color,
    });
  center(t.posterKicker, 510, 8, purple);
  const title = capped(clean(input.title), font, 18, width - 64, 3);
  title.forEach((line, index) => center(line, 486 - index * 22, 18));
  const date = new Intl.DateTimeFormat(input.locale, {
    dateStyle: "long",
    timeZone: "Asia/Baku",
  }).format(new Date(`${input.date}T12:00:00+04:00`));
  const details = capped(
    clean([date, input.venue].filter(Boolean).join(" · ")),
    font,
    8.5,
    width - 70,
    2,
  );
  details.forEach((line, index) => center(line, 419 - index * 11, 8.5, muted));
  const headline = capped(clean(t.posterHeadline), font, 18, width - 70, 2);
  headline.forEach((line, index) => center(line, 386 - index * 22, 18));
  const qr = await doc.embedPng(await qrPng(input.url));
  page.drawImage(qr, { x: (width - 202) / 2, y: 149, width: 202, height: 202 });
  const urlLines = capped(input.url, font, 7.5, width - 70, 2);
  urlLines.forEach((line, index) => center(line, 137 - index * 10, 7.5, muted));
  page.drawRectangle({
    x: 30,
    y: 35,
    width: width - 60,
    height: 83,
    color: rgb(0.96, 0.96, 0.99),
  });
  const expiry = new Intl.DateTimeFormat(input.locale, {
    dateStyle: "long",
    timeZone: "Asia/Baku",
  }).format(new Date(input.expiry));
  const privacy = capped(
    clean(t.posterPrivacy.replace("{date}", expiry)),
    font,
    8.4,
    width - 84,
    6,
  );
  privacy.forEach((line, index) =>
    page.drawText(line, {
      x: 42,
      y: 102 - index * 11,
      size: 8.4,
      font,
      color: muted,
    }),
  );
  center(t.posterPreview, 17, 6.5, muted);
  doc.setTitle(`SnapMatch - ${input.title}`);
  doc.setAuthor("SnapMatch");
  doc.setSubject(t.posterHeadline);
  return doc.save();
}
