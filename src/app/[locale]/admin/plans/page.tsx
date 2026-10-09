import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/site/server";
import { pricingSchema } from "@/lib/billing/schema";
import { PricingEditor } from "@/components/pricing-editor";

export default async function Plans({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const session = await requireAdminSession(locale);
  if (!session) return null;
  const [catalog, history] = await Promise.all([
    session.client
      .from("pricing_catalog")
      .select("draft,revision,published_revision")
      .single(),
    session.client
      .from("pricing_revisions")
      .select("revision,published")
      .order("revision", { ascending: false })
      .limit(50),
  ]);
  const parsed = pricingSchema.safeParse(catalog.data?.draft);
  const t = messages[locale].billing;
  if (catalog.error || history.error || !parsed.success)
    return (
      <p className="notice" role="alert">
        {t.unavailable}
      </p>
    );
  const { notice } = await searchParams;
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">{t.adminEyebrow}</span>
          <h1>{t.plans}</h1>
          <p>{t.adminIntro}</p>
        </div>
      </div>
      {notice && ["saved", "published"].includes(notice) && (
        <p className="notice" role="status">
          {messages[locale].admin[notice as "saved" | "published"]}
        </p>
      )}
      <p>
        {t.revision} {catalog.data.revision} · {t.published}:{" "}
        {catalog.data.published_revision}
      </p>
      <PricingEditor
        initial={parsed.data}
        revision={catalog.data.revision}
        locale={locale}
        history={history.data || []}
      />
    </>
  );
}
