import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { photographerSession } from "@/lib/events/server";
import { EventForm } from "@/components/event-form";
export default async function NewEvent({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { client } = await photographerSession(locale);
  const { error } = await client.from("events").select("id").limit(0);
  const t = messages[locale].phase2;
  return (
    <>
      <p className="eyebrow">{messages[locale].brand}</p>
      <h1>{t.newEvent}</h1>
      <p className="muted">{t.newIntro}</p>
      {error ? (
        <p role="alert" className="notice">
          {t.setup}
        </p>
      ) : (
        <EventForm locale={locale} id={crypto.randomUUID()} />
      )}
    </>
  );
}
