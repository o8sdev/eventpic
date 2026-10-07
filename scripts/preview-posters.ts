import { mkdir, writeFile } from "node:fs/promises";
import { eventPoster } from "../src/lib/events/poster";
async function main() {
  await mkdir("tmp/pdfs", { recursive: true });
  for (const locale of ["en"] as const) {
    const title = "Əli & Aysel — Baku";
    await writeFile(
      `tmp/pdfs/poster-${locale}.pdf`,
      await eventPoster({
        title,
        venue: "Baku",
        date: "2026-10-05",
        expiry: "2026-11-03T20:00:00Z",
        url: "https://snapmatch.example/e/1234abcdef56",
        locale,
      }),
    );
  }
  // Also check the bounded layout against maximum-length input.
  await writeFile(
    "tmp/pdfs/poster-long.pdf",
    await eventPoster({
      title: "Əli və Aysel ".repeat(20).slice(0, 200),
      venue: "Məkan ünvanı ".repeat(30).slice(0, 300),
      date: "2026-10-05",
      expiry: "2026-11-03T20:00:00Z",
      url: "https://snapmatch.example/e/1234abcdef56",
      locale: "en",
    }),
  );
  console.log("Created local QA posters in ignored tmp/pdfs.");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
