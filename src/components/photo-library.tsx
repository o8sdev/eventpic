"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { messages, type Locale } from "@/lib/i18n";
import {
  photoPageSchema,
  photoStatuses,
  type PhotoPage,
} from "@/lib/events/photos";
import { Icon } from "./icon";

export function PhotoLibrary({
  eventId,
  locale,
  editable,
}: {
  eventId: string;
  locale: Locale;
  editable: boolean;
}) {
  const t = messages[locale].phase3;
  const previous = messages[locale].phase2;
  const [data, setData] = useState<PhotoPage | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previewCache = useRef({
    key: "",
    signedAt: 0,
    urls: new Map<
      string,
      { thumbnail: string | null; preview: string | null }
    >(),
  });
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const key = `${eventId}:${page}`;
        const cache = previewCache.current;
        const renew =
          cache.key !== key || Date.now() - cache.signedAt > 50 * 60 * 1000;
        const getPage = async (previews: boolean) => {
          const response = await fetch(
            `/api/events/${eventId}/photos?page=${page}&previews=${previews ? 1 : 0}`,
            { cache: "no-store", signal },
          );
          if (!response.ok) throw new Error("unavailable");
          return photoPageSchema.parse(await response.json());
        };
        let next = await getPage(renew);
        const newPreviews =
          !renew &&
          next.photos.some(
            (photo) => photo.has_preview && !cache.urls.get(photo.id)?.preview,
          );
        if (newPreviews) next = await getPage(true);
        if (signal?.aborted) return;
        if (renew || newPreviews) {
          previewCache.current = {
            key,
            signedAt: Date.now(),
            urls: new Map(
              next.photos.map((photo) => [
                photo.id,
                { thumbnail: photo.thumbnail, preview: photo.preview },
              ]),
            ),
          };
        } else {
          next.photos = next.photos.map((photo) => ({
            ...photo,
            ...(photo.has_preview ? cache.urls.get(photo.id) : {}),
          }));
        }
        setData(next);
        setError(false);
      } catch {
        if (!signal?.aborted) setError(true);
      }
    },
    [eventId, page],
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    // Sequential polling avoids overlapping calls. It pauses in background tabs
    // and renews cached signed URLs before their one-hour expiry.
    const tick = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      if (!document.hidden) await refresh(controller.signal);
      inFlight = false;
      if (!controller.signal.aborted) timer = setTimeout(tick, 5000);
    };
    const visible = () => {
      clearTimeout(timer);
      void tick();
    };
    void tick();
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  async function retry(photoId: string) {
    setRetrying(photoId);
    setRetryError(false);
    try {
      const response = await fetch(
        `/api/events/${eventId}/photos/${photoId}/retry`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("retry");
      await refresh();
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(null);
    }
  }
  const preview = data?.photos.find((photo) => photo.id === selected);
  return (
    <section className="photo-library" aria-labelledby="photo-library-title">
      <div className="upload-heading">
        <h2 id="photo-library-title">{previous.library}</h2>
        <span className="version-badge">
          {data?.count || 0} {messages[locale].photos}
        </span>
      </div>
      <p className="phase-note">{t.live}</p>
      {data && (
        <div className="processing-counts" aria-live="polite">
          {photoStatuses
            .filter((status) => (data.counts[status] || 0) > 0)
            .map((status) => (
              <span key={status}>
                <strong>{data.counts[status]}</strong>{" "}
                {previous.photoStatuses[status]}
              </span>
            ))}
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {t.connectionError}{" "}
          <button className="small-button" onClick={() => void refresh()}>
            {t.refresh}
          </button>
        </p>
      )}
      {retryError && (
        <p className="notice" role="alert">
          {t.retryUnavailable}
        </p>
      )}
      {!data && !error && (
        <div
          className="photo-library-grid"
          aria-label={t.loading}
          aria-busy="true"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="photo-library-skeleton" />
          ))}
        </div>
      )}
      {data && !data.photos.length && (
        <div className="card empty">
          <Icon name="image" size={35} />
          <p className="muted">{previous.noPhotos}</p>
        </div>
      )}
      {data && (
        <div className="photo-library-grid">
          {data.photos.map((photo) => (
            <article className="photo-library-card" key={photo.id}>
              <button
                type="button"
                className="photo-preview photo-preview-button"
                disabled={!photo.preview}
                onClick={() => setSelected(photo.id)}
                aria-label={`${t.preview}: ${photo.original_filename}`}
              >
                {photo.thumbnail ? (
                  <Image
                    unoptimized
                    src={photo.thumbnail}
                    width={400}
                    height={300}
                    alt={photo.original_filename}
                    loading="lazy"
                  />
                ) : (
                  <Icon name="image" size={30} />
                )}
              </button>
              <div>
                <h3 title={photo.original_filename}>
                  {photo.original_filename}
                </h3>
                <span className={`photo-status ${photo.status}`}>
                  {previous.photoStatuses[photo.status]}
                </span>
                <small>
                  {((photo.bytes || 0) / 1024 / 1024).toFixed(1)} MB ·{" "}
                  {previous.faces}: {photo.face_count}
                </small>
                {photo.status === "indexed" && photo.face_count === 0 && (
                  <p className="photo-processing-note">{t.noFaces}</p>
                )}
                {photo.unindexed_face_count > 0 && (
                  <p className="photo-processing-note">{t.qualitySkipped}</p>
                )}
                {photo.status === "failed" && (
                  <p className="photo-processing-note">
                    {t.errors[photo.error as keyof typeof t.errors] ||
                      t.errors.processing_error}
                  </p>
                )}
                {photo.job?.status === "failed" && (
                  <small>
                    {t.autoRetry} {photo.job.attempts}/{photo.job.max_attempts}
                  </small>
                )}
                {editable && photo.job?.status === "dead" && (
                  <button
                    className="small-button"
                    disabled={!!retrying}
                    onClick={() => void retry(photo.id)}
                  >
                    {retrying === photo.id ? t.retrying : t.retry}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {data && data.count > 48 && (
        <div className="queue-pages">
          <button
            className="small-button"
            disabled={page === 0}
            onClick={() => {
              setData(null);
              setPage(page - 1);
            }}
          >
            {previous.previous}
          </button>
          <span>
            {page + 1} / {Math.ceil(data.count / 48)}
          </span>
          <button
            className="small-button"
            disabled={(page + 1) * 48 >= data.count}
            onClick={() => {
              setData(null);
              setPage(page + 1);
            }}
          >
            {previous.next}
          </button>
        </div>
      )}
      <dialog
        className="photo-preview-dialog"
        ref={dialog}
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}
      >
        <button className="small-button" onClick={() => setSelected(null)}>
          {t.close}
        </button>
        {preview?.preview && (
          <Image
            unoptimized
            src={preview.preview}
            width={2048}
            height={2048}
            alt={preview.original_filename}
          />
        )}
        <p>{preview?.original_filename}</p>
      </dialog>
    </section>
  );
}
