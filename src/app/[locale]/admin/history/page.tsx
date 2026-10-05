import { notFound } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/site/server";
import { changeContent } from "../actions";
type Revision = {
  version: number;
  action: "save" | "publish" | "restore";
  created_at: string;
};
export default async function History({
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
  const [rows, state] = await Promise.all([
    client
      .from("site_content_revisions")
      .select("version,action,created_at")
      .eq("locale", locale)
      .order("version", { ascending: false })
      .limit(50),
    client.from("site_content").select("version").eq("locale", locale).single(),
  ]);
  const actionLabels = {
    save: t.saveAction,
    publish: t.publishAction,
    restore: t.restoreAction,
  };
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>{t.history}</h1>
          <p>{t.translationHelp}</p>
        </div>
      </div>
      {rows.error || state.error ? (
        <p className="notice">{t.error}</p>
      ) : (
        <div className="admin-card">
          {rows.data.length === 0 ? (
            <p>{t.noHistory}</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t.version}</th>
                    <th>{t.action}</th>
                    <th>{t.date}</th>
                    <th>{t.restore}</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows.data as Revision[]).map((row) => (
                    <tr key={row.version}>
                      <td>{row.version}</td>
                      <td>{actionLabels[row.action]}</td>
                      <td>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Baku",
                        }).format(new Date(row.created_at))}
                      </td>
                      <td>
                        <form action={changeContent}>
                          <input name="locale" type="hidden" value={locale} />
                          <input
                            name="version"
                            type="hidden"
                            value={state.data.version}
                          />
                          <input name="action" type="hidden" value="restore" />
                          <input
                            name="restore_version"
                            type="hidden"
                            value={row.version}
                          />
                          <button className="small-button" type="submit">
                            {t.restore}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
