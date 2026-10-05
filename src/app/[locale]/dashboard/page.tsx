import { notFound, redirect } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { createClient, isConfigured } from "@/lib/supabase/server";
type Event = {
  id: string;
  title: string;
  event_date: string;
  venue: string | null;
  status: keyof typeof messages.en.status;
  photo_count: number;
  guest_count: number;
  download_count: number;
};
export default async function Dashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!isConfigured()) redirect(`/${locale}/login`);
  const t = messages[locale];
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const { data, error } = await client.rpc("photographer_event_summary");
  const events = (data || []) as Event[];
  return (
    <>
      <p className="eyebrow">{t.brand}</p>
      <h1>{t.dashboard}</h1>
      <p className="muted">{t.dashboardIntro}</p>
      {error ? (
        <p role="alert" className="notice">
          {t.loadError}
        </p>
      ) : (
        <>
          <div className="stats">
            {[
              [t.events, events.length],
              [t.photos, events.reduce((n, e) => n + Number(e.photo_count), 0)],
              [t.guests, events.reduce((n, e) => n + Number(e.guest_count), 0)],
              [
                t.downloads,
                events.reduce((n, e) => n + Number(e.download_count), 0),
              ],
            ].map(([label, value]) => (
              <div className="card stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {events.length === 0 ? (
            <section className="card empty">
              <span className="small-flower" aria-hidden="true">
                ✧
              </span>
              <h2>{t.empty}</h2>
              <p className="muted">{t.emptyBody}</p>
            </section>
          ) : (
            <div className="event-grid">
              {events.map((event) => (
                <article className="card" key={event.id}>
                  <span className="badge">{t.status[event.status]}</span>
                  <h2>{event.title}</h2>
                  <p className="muted">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "long",
                      timeZone: "Asia/Baku",
                    }).format(new Date(`${event.event_date}T12:00:00+04:00`))}
                    {event.venue && ` · ${event.venue}`}
                  </p>
                  <div className="event-counts">
                    <span>
                      {t.photos}: {event.photo_count}
                    </span>
                    <span>
                      {t.guests}: {event.guest_count}
                    </span>
                    <span>
                      {t.downloads}: {event.download_count}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
