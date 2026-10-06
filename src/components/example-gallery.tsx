"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { messages, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/lib/site/schema";

export function ExampleGallery({
  locale,
  content,
}: {
  locale: Locale;
  content: SiteContent;
}) {
  const m = messages[locale].modern;
  const photos = content.branding.examplePhotos || [];
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState(0);
  if (!photos.length) return null;
  const index = active % photos.length;
  const selected = photos[index];
  function open(index: number) {
    setActive(index);
    dialog.current?.showModal();
  }
  return (
    <section
      className="modern-section example-gallery"
      aria-labelledby="example-gallery-title"
    >
      <div className="example-gallery-heading" data-reveal>
        <div>
          <span className="eyebrow">{m.exampleKicker}</span>
          <h2 id="example-gallery-title">
            {content.walkthrough.examplesTitle || m.examplesTitle}
          </h2>
          <p>
            {content.walkthrough.examplesDescription || m.examplesDescription}
          </p>
        </div>
        <span className="example-gallery-hint">{m.openExample}</span>
      </div>
      <div className="example-photo-grid">
        {photos.map((photo, index) => (
          <button
            key={index}
            className="example-photo"
            onClick={() => open(index)}
            aria-label={`${m.openExample}: ${photo.alt}`}
            data-reveal
          >
            <Image
              src={photo.image}
              alt={photo.alt}
              fill
              sizes="(max-width: 600px) 46vw, (max-width: 1000px) 43vw, 24vw"
            />
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <p className="example-gallery-note">{m.exampleNote}</p>
      <dialog
        className="example-lightbox"
        ref={dialog}
        aria-label={m.galleryPreview}
      >
        <div className="example-lightbox-toolbar">
          <span>
            {m.galleryPreview} · {index + 1} / {photos.length}
          </span>
          <button
            onClick={() => dialog.current?.close()}
            aria-label={m.closeExample}
          >
            ×
          </button>
        </div>
        <div className="example-lightbox-image">
          <Image src={selected.image} alt={selected.alt} fill sizes="90vw" />
        </div>
        <div className="example-lightbox-navigation">
          <button
            onClick={() =>
              setActive((index + photos.length - 1) % photos.length)
            }
          >
            {m.previousExample}
          </button>
          <p>{selected.alt}</p>
          <button onClick={() => setActive((index + 1) % photos.length)}>
            {m.nextExample}
          </button>
        </div>
      </dialog>
    </section>
  );
}
