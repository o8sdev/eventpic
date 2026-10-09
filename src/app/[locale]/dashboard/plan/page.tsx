import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { photographerSession } from "@/lib/events/server";
import { PlanUsagePanel } from "@/components/plan-usage";
import { releaseUnusedUploads } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { client } = await photographerSession(locale);
  const { data, error } = await client.rpc("my_plan_usage");
  const t = messages[locale].billing;
  const {notice}=await searchParams;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t.workspace}</span>
          <h1>{t.planUsage}</h1>
          <p>{t.usageIntro}</p>
        </div>
      </div>
      {notice && <p className="notice" role="status">{notice==="released"?t.released:t.unavailable}</p>}
      {error || !data ? (
        <p className="notice" role="alert">
          {t.unavailable}
        </p>
      ) : (
        <PlanUsagePanel value={data} locale={locale} />
      )}
      <Link className="button" href={`/${locale}/contact`}>
        {t.changePlan}
      </Link>
      <form action={releaseUnusedUploads} className="admin-card">
        <input type="hidden" name="locale" value={locale}/><h2>{t.releaseTitle}</h2><p>{t.releaseHelp}</p>
        <SubmitButton label={t.releaseButton} pending={messages[locale].saving}/>
      </form>
    </>
  );
}
