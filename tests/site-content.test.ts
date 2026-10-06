import test from "node:test";
import assert from "node:assert/strict";
import { defaultSiteContent, withSiteDefaults } from "../src/lib/site/defaults";
import { siteContentSchema } from "../src/lib/site/schema";
import { locales } from "../src/lib/i18n";

test("existing CMS documents gain gallery fields without losing published copy", () => {
  for (const locale of locales) {
    const legacy = defaultSiteContent(locale);
    legacy.hero.title = "Published custom headline";
    delete legacy.walkthrough.examplesTitle;
    delete legacy.walkthrough.examplesDescription;
    delete legacy.walkthrough.showExamples;
    delete legacy.branding.examplePhotos;
    const hydrated = withSiteDefaults(locale, siteContentSchema.parse(legacy));
    assert.equal(hydrated.hero.title, legacy.hero.title);
    assert.equal(
      hydrated.walkthrough.examplesTitle,
      defaultSiteContent(locale).walkthrough.examplesTitle,
    );
    assert.equal(hydrated.branding.examplePhotos?.length, 4);
    hydrated.walkthrough.showExamples = false;
    assert.equal(
      withSiteDefaults(locale, hydrated).walkthrough.showExamples,
      false,
    );
  }
});

test("public example photos reject external URLs, private storage paths and brand logos", () => {
  const content = defaultSiteContent("en");
  for (const image of [
    "https://example.com/photo.jpg",
    "/storage/v1/object/private/photo.jpg",
    "/brand/snapmatch-logo.png",
  ]) {
    assert.equal(
      siteContentSchema.safeParse({
        ...content,
        branding: {
          ...content.branding,
          examplePhotos: [
            { image, alt: "Example image" },
            ...content.branding.examplePhotos!.slice(1),
          ],
        },
      }).success,
      false,
    );
  }
});
