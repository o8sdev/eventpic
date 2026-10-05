"use client";
import { usePathname } from "next/navigation";
import { locales } from "@/lib/i18n";
export function LanguageSwitcher({ label }: { label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="languages">
      {locales.map((locale) => (
        // Full navigation refreshes the root layout's document language as well as copy.
        <a
          key={locale}
          href={path.replace(/^\/(az|ru|en)(?=\/|$)/, `/${locale}`)}
          hrefLang={locale}
          aria-current={path.split("/")[1] === locale ? "page" : undefined}
        >
          {locale.toUpperCase()}
        </a>
      ))}
    </nav>
  );
}
