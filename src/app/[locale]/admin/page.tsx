import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, messages, type Locale } from "@/lib/i18n";
import { defaultSiteContent } from "@/lib/site/defaults";
import { siteContentSchema } from "@/lib/site/schema";
import { requireAdminSession } from "@/lib/site/server";
type ContentRow = {
  locale: Locale;
  draft: unknown;
  published: unknown;
  version: number;
  published_version: number | null;
};
export default async function AdminOverview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages[locale].admin;
  const session = await requireAdminSession(locale);
  if (!session) return null;
  const { client } = session;
  const [summary, rows] = await Promise.all([
    client.rpc("admin_platform_summary"),
    client
      .from("site_content")
      .select("locale,draft,published,version,published_version")
      .eq("locale", "en")
      .order("locale"),
  ]);
  if (summary.error || rows.error)
    return (
      <p className="notice" role="alert">
        {t.setup}
      </p>
    );
  const data = summary.data as Record<string, number>;
  const statuses = rows.data as ContentRow[];
  const row = statuses.find((r) => r.locale === locale);
  const draft = siteContentSchema.safeParse(row?.draft);
  const c = draft.success ? draft.data : defaultSiteContent(locale);
  const missing = (["legalName", "email", "phone", "address"] as const).filter(
    (key) => !c.company[key],
  );
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">SnapMatch</span>
          <h1>{t.overview}</h1>
          <p>{t.subtitle}</p>
        </div>
        <Link className="button" href={`/${locale}/admin/edit`}>
          {t.editor} →
        </Link>
      </div>
      <div className="admin-stats">
        {[
          ["photographers", t.photographers],
          ["events", t.events],
          ["photos", t.photos],
          ["jobs_queued", t.jobsQueued],
          ["jobs_failed", t.jobsFailed],
        ].map(([key, label]) => (
          <div className="card stat" key={key}>
            <span>{label}</span>
            <strong>{data[key]}</strong>
          </div>
        ))}
      </div>
      <p className="admin-help">{t.readOnly}</p>
      <section className="admin-card">
        <h2>{t.contentStatus}</h2>
        <p>{t.translationHelp}</p>
        <div className="content-status-grid">
          {statuses.map((status) => (
            <Link
              href={`/${status.locale}/admin/edit`}
              className="locale-status"
              key={status.locale}
            >
              <strong>{status.locale.toUpperCase()}</strong>
              <span>
                {status.published_version === null ? t.unpublished : t.live}
              </span>
              <small>
                {t.version} {status.version}
              </small>
              <span className="status-dot">
                {JSON.stringify(status.draft) !==
                JSON.stringify(status.published)
                  ? t.pending
                  : t.clean}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <div className="admin-two-col">
        <section className="admin-card">
          <h2>{t.missing}</h2>
          <p>{t.placeholders}</p>
          <ul>
            {missing.map((key) => (
              <li key={key}>{t[key]}</li>
            ))}
          </ul>
          <Link className="quiet-link" href={`/${locale}/admin/edit`}>
            {t.editor} →
          </Link>
        </section>
        <section className="admin-card">
          <h2>{t.legalReview}</h2>
          <p>{messages[locale].modern.draftNotice}</p>
          <ul>
            <li>
              {messages[locale].modern.privacy}:{" "}
              {c.legal.privacyReviewed ? "✓" : t.pending}
            </li>
            <li>
              {messages[locale].modern.terms}:{" "}
              {c.legal.termsReviewed ? "✓" : t.pending}
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
