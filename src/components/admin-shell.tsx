"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { messages, type Locale } from "@/lib/i18n";
import { Brand } from "./brand";
import { LanguageSwitcher } from "./language-switcher";
import { signOut } from "@/app/[locale]/actions";
import { Icon } from "./icon";
export function AdminShell({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const t = messages[locale].admin;
  if (path.endsWith("/preview")) return <>{children}</>;
  const links = [
    { suffix: "", label: t.overview, icon: "spark" },
    { suffix: "/edit", label: t.editor, icon: "image" },
    { suffix: "/history", label: t.history, icon: "scan" },
    { suffix: "/activity", label: t.audit, icon: "shield" },
  ];
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link href={`/${locale}/admin`}>
          <Brand name="SnapMatch" />
        </Link>
        <span className="admin-caption">{t.title}</span>
        <nav>
          {links.map((l) => (
            <Link
              key={l.suffix}
              href={`/${locale}/admin${l.suffix}`}
              aria-current={
                path === `/${locale}/admin${l.suffix}` ? "page" : undefined
              }
            >
              <Icon name={l.icon} size={18} />
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href={`/${locale}`} target="_blank">
            {t.site}
            <span aria-hidden="true">↗</span>
          </Link>
          <Link href={`/${locale}/dashboard`}>{t.studio}</Link>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>{t.title}</span>
          <div>
            <LanguageSwitcher label={messages[locale].language} />
            <form action={signOut}>
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" className="text-button">
                {messages[locale].logout}
              </button>
            </form>
          </div>
        </header>
        <div className="admin-page">{children}</div>
      </div>
    </div>
  );
}
