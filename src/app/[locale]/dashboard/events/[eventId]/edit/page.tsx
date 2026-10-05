import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { ownedEvent } from "@/lib/events/server";
import { EventForm } from "@/components/event-form";
export default async function EditEvent({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale, eventId } = await params;
  if (!isLocale(locale)) notFound();
  const { client, event } = await ownedEvent(locale, eventId);
  const t = messages[locale].phase2;
  if (!event)
    return (
      <p role="alert" className="notice">
        {t.setup}
      </p>
    );
  const { count, error } = await client
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id);
  return (
    <>
      <p className="eyebrow">{t.settings}</p>
      <h1>{event.title}</h1>
      <p className="muted">{t.editIntro}</p>
      {!["draft", "active"].includes(event.status) ? (
        <p className="notice">{t.readOnly}</p>
      ) : error ? (
        <p className="notice">{t.setup}</p>
      ) : (
        <EventForm
          locale={locale}
          id={event.id}
          event={event}
          watermarkLocked={Boolean(count)}
        />
      )}
    </>
  );
}
