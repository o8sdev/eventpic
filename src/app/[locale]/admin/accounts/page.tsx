import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isLocale, messages } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/site/server";
import { PlanUsagePanel } from "@/components/plan-usage";
import type { PlanUsage } from "@/lib/billing/server";
import type { Plan } from "@/lib/billing/schema";
import { assignPlan } from "../plans/actions";
import { SubmitButton } from "@/components/submit-button";
import { createPhotographer } from "./actions";
import { adminClientConfigured } from "@/lib/supabase/admin";

export default async function Accounts({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ owner?: string; notice?: string; page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const session = await requireAdminSession(locale);
  if (!session) return null;
  const query = await searchParams,
    page = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .catch(0)
      .parse(query.page || 0);
  const t = messages[locale].billing,
    a = messages[locale].admin;
  const accountText = messages[locale].accountCreation;
  const accountNotice =
    query.notice && Object.hasOwn(accountText.notices, query.notice)
      ? accountText.notices[query.notice as keyof typeof accountText.notices]
      : null;
  const { data: accounts, error } = await session.client.rpc(
    "admin_billing_accounts",
    { p_page: page },
  );
  if (error) return <p className="notice">{t.unavailable}</p>;
  let value: PlanUsage | null = null;
  if (query.owner && z.uuid().safeParse(query.owner).success) {
    const result = await session.client.rpc("admin_plan_usage", {
      p_owner: query.owner,
    });
    if (result.error) notFound();
    value = result.data;
  }
  const versions = await session.client
    .from("plan_versions")
    .select("id,revision,document")
    .order("revision", { ascending: false });
  if (versions.error) return <p className="notice">{t.unavailable}</p>;
  const date = (s: string | null) => (s ? s.slice(0, 10) : "");
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">{t.adminEyebrow}</span>
          <h1>{t.accounts}</h1>
          <p>{t.accountsIntro}</p>
        </div>
      </div>
      {query.notice &&
        ["saved", "invalid", "error", "conflict"].includes(query.notice) && (
          <p role="status" className="notice">
            {a[query.notice as "saved" | "invalid" | "error" | "conflict"]}
          </p>
        )}
      {accountNotice && (
        <p className="notice" role="status">
          {accountNotice}
        </p>
      )}
      <section className="admin-card">
        <h2>{accountText.title}</h2>
        <p>{accountText.description}</p>
        {adminClientConfigured() ? (
          <form action={createPhotographer}>
            <input type="hidden" name="locale" value={locale} />
            <div className="billing-form-grid">
              <label className="field">
                {messages[locale].name}
                <input
                  name="full_name"
                  required
                  maxLength={120}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                {messages[locale].business}
                <input
                  name="business_name"
                  maxLength={160}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                {messages[locale].email}
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                {messages[locale].passwordAuth.password}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={72}
                  autoComplete="new-password"
                  aria-describedby="new-password-hint"
                />
              </label>
            </div>
            <p id="new-password-hint" className="admin-help">
              {accountText.passwordHint}
            </p>
            <SubmitButton
              label={accountText.submit}
              pending={accountText.creating}
            />
          </form>
        ) : (
          <p role="alert" className="notice">
            {accountText.notices.accountSetup}
          </p>
        )}
      </section>
      <section className="admin-card">
        <form method="get" className="billing-actions">
          <label className="field">
            {t.accountId}
            <input name="owner" required placeholder={t.accountId} />
          </label>
          <button className="button" type="submit">
            {t.openAccount}
          </button>
        </form>
        <div className="billing-table-wrap">
          <table className="billing-table">
            <thead>
              <tr>
                <th>{t.account}</th>
                <th>{t.currentPlan}</th>
                <th>{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {(
                accounts as {
                  id: string;
                  full_name: string;
                  business_name: string;
                  plan_name: string | null;
                  state: string | null;
                }[]
              ).map((account) => (
                <tr key={account.id}>
                  <td>
                    <Link
                      href={`/${locale}/admin/accounts?owner=${account.id}`}
                    >
                      {account.business_name || account.full_name || account.id}
                    </Link>
                  </td>
                  <td>{account.plan_name || t.notStarted}</td>
                  <td>{account.state || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {accounts.length === 0 && <p>{t.noAccounts}</p>}
        <div className="billing-actions">
          {page > 0 && <Link href={`?page=${page - 1}`}>{t.previous}</Link>}
          {accounts.length === 25 && (
            <Link href={`?page=${page + 1}`}>{t.next}</Link>
          )}
        </div>
      </section>
      {value && (
        <>
          <PlanUsagePanel value={value} locale={locale} />
          <form action={assignPlan} className="admin-card">
            <h2>{t.manageAccount}</h2>
            <p>{t.assignmentHelp}</p>
            <input type="hidden" name="locale" value={locale} />
            <input
              type="hidden"
              name="owner"
              value={value.account.photographer_id}
            />
            <input type="hidden" name="version" value={value.account.version} />
            <div className="billing-form-grid">
              <label className="field">
                {t.currentPlan}
                <select
                  name="plan_version"
                  defaultValue={value.account.plan_version_id}
                >
                  {versions.data.map(
                    (v: { id: string; revision: number; document: Plan }) => (
                      <option value={v.id} key={v.id}>
                        {v.document.name} · {t.revision} {v.revision} ·{" "}
                        {v.document.price_minor / 100} AZN
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                {t.status}
                <select name="state" defaultValue={value.account.state}>
                  {(["trial", "active", "suspended"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t.states[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t.validUntil}
                <input
                  required
                  type="date"
                  name="valid_until"
                  defaultValue={date(value.account.valid_until)}
                />
              </label>
              <label className="field">
                {t.effectiveAt}
                <input type="date" name="effective_at" />
              </label>
            </div>
            <h3>{t.temporaryAllowances}</h3>
            <p>{t.bonusHelp}</p>
            <div className="billing-form-grid">
              {(
                [
                  ["photos", t.photos, value.account.bonuses.photos],
                  [
                    "storage_gb",
                    t.storageGB,
                    value.account.bonuses.storage_bytes / 1e9,
                  ],
                  [
                    "active_events",
                    t.events,
                    value.account.bonuses.active_events,
                  ],
                  ["searches", t.searches, value.account.bonuses.searches],
                  [
                    "delivery_gb",
                    t.deliveryGB,
                    value.account.bonuses.delivery_bytes / 1e9,
                  ],
                ] as const
              ).map(([name, label, current]) => (
                <label className="field" key={name}>
                  {label}
                  <input
                    type="number"
                    name={name}
                    min="0"
                    required
                    defaultValue={current}
                  />
                </label>
              ))}
              <label className="field">
                {t.bonusUntil}
                <input
                  type="date"
                  name="bonus_until"
                  defaultValue={date(value.account.bonus_until)}
                />
              </label>
            </div>
            <label className="field">
              {t.reason}
              <textarea name="reason" required minLength={3} maxLength={500} />
            </label>
            <SubmitButton
              label={t.applyChanges}
              pending={messages[locale].saving}
            />
          </form>
        </>
      )}
    </>
  );
}
