import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/site/server";
type Entry = {
  id: string;
  locale: string;
  action: string;
  created_at: string;
  metadata: { version?: number };
};
export default async function Activity({
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
  const { data, error } = await client
    .from("admin_audit_log")
    .select("id,locale,action,created_at,metadata")
    .order("created_at", { ascending: false })
    .limit(100);
  const labels: Record<string, string> = {
    content_save: t.saveAction,
    content_publish: t.publishAction,
    content_restore: t.restoreAction,
  };
  return (
    <>
      <div className="admin-heading">
        <h1>{t.audit}</h1>
      </div>
      <div className="admin-card">
        {error ? (
          <p>{t.error}</p>
        ) : !data?.length ? (
          <p>{t.noActivity}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.action}</th>
                  <th>{t.localeLabel}</th>
                  <th>{t.version}</th>
                  <th>{t.date}</th>
                </tr>
              </thead>
              <tbody>
                {(data as Entry[]).map((row) => (
                  <tr key={row.id}>
                    <td>{labels[row.action] || t.action}</td>
                    <td>{row.locale?.toUpperCase()}</td>
                    <td>{row.metadata.version}</td>
                    <td>
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Baku",
                      }).format(new Date(row.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
