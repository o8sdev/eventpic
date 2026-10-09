import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { ownedEvent, guestUrl } from "@/lib/events/server";
import { BulkUploader } from "@/components/bulk-uploader";
import { EventShare } from "@/components/event-share";
import { PhotoLibrary } from "@/components/photo-library";
import { removeCover, changeEventStatus } from "../actions";
import { quotaErrors } from "@/lib/billing/schema";
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
  const editable = ["draft", "active"].includes(event.status);
  const cover = event.cover_path
    ? await client.storage
        .from("branding")
        .createSignedUrl(event.cover_path, 3600)
    : null;
  const notice = ["saved", "coverError", "saveError", ...quotaErrors].includes(
    query.notice || "",
  )
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
          {t[notice as keyof typeof t] as string}
        </p>
      )}
      {event.status === "draft" && <p className="phase-note">{t.draftHelp}</p>}
      {(editable || event.status === "closed") && (
        <form action={changeEventStatus} className="event-plan-control">
          <input name="locale" value={locale} type="hidden" />
          <input name="id" value={event.id} type="hidden" />
          <input
            name="status"
            value={event.status === "closed" ? "active" : "closed"}
            type="hidden"
          />
          <button type="submit" className="small-button">
            {event.status === "closed"
              ? messages[locale].billing.reopenEvent
              : messages[locale].billing.closeEvent}
          </button>
          <p className="muted">{messages[locale].billing.closeHelp}</p>
        </form>
      )}
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
      <PhotoLibrary eventId={event.id} locale={locale} editable={editable} />
    </>
  );
}
