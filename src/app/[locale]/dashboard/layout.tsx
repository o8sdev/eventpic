import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { signOut } from "../actions";
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!isConfigured()) redirect(`/${locale}`);
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}`);
  const t = messages[locale];
  return (
    <div className="workspace">
      <nav className="dashboard-nav">
        <Link href={`/${locale}/dashboard`}>{t.dashboard}</Link>
        <Link href={`/${locale}/dashboard/profile`}>{t.profile}</Link>
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="text-button">
            {t.logout}
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
