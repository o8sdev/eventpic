import { notFound, redirect } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { getAdminSession } from "@/lib/site/server";
import { AdminShell } from "@/components/admin-shell";
export const metadata = {
  title: "SnapMatch Admin",
  robots: { index: false, follow: false },
};
export default async function AdminLayout({
  params,
  children,
}: {
  params: Promise<{ locale: string }>;
  children: React.ReactNode;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const session = await getAdminSession();
  if (!session.user) redirect(`/${locale}/login`);
  if (!session.available)
    return (
      <div className="legal-page">
        <h1>{messages[locale].admin.setup}</h1>
        <p>{messages[locale].admin.setupBody}</p>
      </div>
    );
  if (!session.admin) notFound();
  return <AdminShell locale={locale}>{children}</AdminShell>;
}
