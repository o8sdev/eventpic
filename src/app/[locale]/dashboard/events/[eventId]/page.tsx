import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isLocale, messages } from "@/lib/i18n";
import { ownedEvent, guestUrl } from "@/lib/events/server";
import { BulkUploader } from "@/components/bulk-uploader";
import { EventShare } from "@/components/event-share";
import { Icon } from "@/components/icon";
import { removeCover } from "../actions";
type Photo = {
  id: string;
  original_filename: string;
  bytes: number;
  face_count: number;
  status: keyof typeof messages.en.phase2.photoStatuses;
  thumb_path: string | null;
};
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams: Promise<{ notice?: string; page?: string }>;
}) {
  const { locale, eventId } = await params;
  if (!isLocale(locale)) notFound();
  const { client, user, event } = await ownedEvent(locale, eventId);
  const t = messages[locale].phase2;
  if (!event)
    return (
      <p role="alert" className="notice">
        {t.setup}
      </p>
    );
  const query = await searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(0)
    .max(100000)
    .catch(0)
    .parse(query.page || 0);
  const editable = ["draft", "active"].includes(event.status);
  const { data, count, error } = await client
    .from("photos")
    .select("id,original_filename,bytes,face_count,status,thumb_path", {
      count: "exact",
    })
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 48, page * 48 + 47);
  const photos = (data || []) as Photo[];
  const paths = photos.flatMap((photo) =>
    photo.thumb_path ? [photo.thumb_path] : [],
  );
  const signed = paths.length
    ? await client.storage.from("thumbnails").createSignedUrls(paths, 3600)
    : null;
  const thumbnails = new Map(
    (signed?.data || []).map((item) => [item.path, item.signedUrl]),
  );
  const cover = event.cover_path
    ? await client.storage
        .from("branding")
        .createSignedUrl(event.cover_path, 3600)
    : null;
  const notice = ["saved", "coverError"].includes(query.notice || "")
    ? query.notice
    : undefined;
  return (
    <>
      <Link className="quiet-link" href={`/${locale}/dashboard`}>
        ← {t.back}
      </Link>
      <div className="event-detail-heading">
        <div>
          <span className="badge">{messages[locale].status[event.status]}</span>
          <h1>{event.title}</h1>
          <p className="muted">
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "long",
              timeZone: "Asia/Baku",
            }).format(new Date(`${event.event_date}T12:00:00+04:00`))}
            {event.venue && ` · ${event.venue}`}
          </p>
        </div>
        {editable && (
          <Link
            className="button button-secondary"
            href={`/${locale}/dashboard/events/${event.id}/edit`}
          >
            {t.edit}
          </Link>
        )}
      </div>
      {notice && (
        <p className="notice" role="status">
          {t[notice as "saved" | "coverError"]}
        </p>
      )}
      {event.status === "draft" && <p className="phase-note">{t.draftHelp}</p>}
      {cover?.data && (
        <div className="event-cover">
          <Image
            unoptimized
            src={cover.data.signedUrl}
            width={1600}
            height={900}
            alt={event.title}
          />
          {editable && (
            <form action={removeCover}>
              <input name="locale" value={locale} type="hidden" />
              <input name="id" value={event.id} type="hidden" />
              <button className="small-button" type="submit">
                {t.removeCover}
              </button>
            </form>
          )}
        </div>
      )}
      <EventShare
        locale={locale}
        eventId={event.id}
        url={guestUrl(event.slug)}
      />
      {editable ? (
        <BulkUploader locale={locale} eventId={event.id} ownerId={user.id} />
      ) : (
        <p className="notice">{t.readOnly}</p>
      )}
      <section className="photo-library">
        <div className="upload-heading">
          <h2>{t.library}</h2>
          <span className="version-badge">
            {count || 0} {messages[locale].photos}
          </span>
        </div>
        <p className="phase-note">{t.pendingWorker}</p>
        {error ? (
          <p role="alert" className="notice">
            {t.setup}
          </p>
        ) : !photos.length ? (
          <div className="card empty">
            <Icon name="image" size={35} />
            <p className="muted">{t.noPhotos}</p>
          </div>
        ) : (
          <div className="photo-library-grid">
            {photos.map((photo) => (
              <article className="photo-library-card" key={photo.id}>
                <div className="photo-preview">
                  {photo.thumb_path && thumbnails.get(photo.thumb_path) ? (
                    <Image
                      unoptimized
                      src={thumbnails.get(photo.thumb_path)!}
                      width={400}
                      height={300}
                      alt={photo.original_filename}
                      loading="lazy"
                    />
                  ) : (
                    <Icon name="image" size={30} />
                  )}
                </div>
                <div>
                  <h3 title={photo.original_filename}>
                    {photo.original_filename}
                  </h3>
                  <span className={`photo-status ${photo.status}`}>
                    {t.photoStatuses[photo.status]}
                  </span>
                  <small>
                    {(Number(photo.bytes) / 1024 / 1024).toFixed(1)} MB ·{" "}
                    {t.faces}: {photo.face_count}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
        {(count || 0) > 48 && (
          <div className="queue-pages">
            {page > 0 && (
              <Link className="small-button" href={`?page=${page - 1}`}>
                {t.previous}
              </Link>
            )}
            <span>
              {page + 1} / {Math.ceil((count || 0) / 48)}
            </span>
            {(page + 1) * 48 < (count || 0) && (
              <Link className="small-button" href={`?page=${page + 1}`}>
                {t.next}
              </Link>
            )}
          </div>
        )}
      </section>
    </>
  );
}
