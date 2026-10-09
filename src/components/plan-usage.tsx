import { messages, type Locale } from "@/lib/i18n";
import type { PlanUsage } from "@/lib/billing/server";
import { formatGB, formatPrice } from "@/lib/billing/schema";

export function PlanUsagePanel({
  value,
  locale,
}: {
  value: PlanUsage;
  locale: Locale;
}) {
  const t = messages[locale].billing,
    { account: a, plan: p, usage: u } = value;
  const expired = value.expired;
  const rows = [
    [t.photos, u.photos, p.photos, false],
    [t.storage, a.storage_used + a.storage_reserved, p.storage_bytes, true],
    [t.events, value.active_events, p.active_events, false],
    [t.searches, u.searches, p.searches, false],
    [t.delivery, u.delivery_bytes, p.delivery_bytes, true],
  ] as const;
  const date = (s: string) =>
    new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(s));
  return (
    <section className="admin-card plan-usage">
      <div className="plan-usage-heading">
        <div>
          <span className="eyebrow">{t.currentPlan}</span>
          <h2>{p.name}</h2>
        </div>
        <strong>
          {formatPrice(p.price_minor)} AZN <small>{t.perMonth}</small>
        </strong>
      </div>
      <p>
        {t.status}: {expired ? t.expired : t.states[a.state]} · {t.accessUntil}{" "}
        {date(a.valid_until)}
      </p>
      <p>
        {t.cycle}: {date(value.period_start)} – {date(value.period_end)}
      </p>
      <div className="usage-grid">
        {rows.map(([label, used, limit, bytes]) => (
          <div key={label}>
            <div>
              <span>{label}</span>
              <strong>
                {bytes ? formatGB(used) : used.toLocaleString("en")} /{" "}
                {bytes ? `${formatGB(limit)} GB` : limit.toLocaleString("en")}
              </strong>
            </div>
            <progress
              value={Math.min(used, limit)}
              max={limit}
              aria-label={label}
            />
            {used >= limit * 0.8 && (
              <small>{used >= limit ? t.atLimit : t.nearLimit}</small>
            )}
          </div>
        ))}
      </div>
      <p className="admin-help">
        {t.reserved.replace("{amount}", formatGB(a.storage_reserved))}
      </p>
      <p className="admin-help">{t.meteringNote}</p>
      {a.next_at && (
        <p>
          {t.scheduled} {date(a.next_at)}
        </p>
      )}
    </section>
  );
}
