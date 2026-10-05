import Link from "next/link";
import { headers } from "next/headers";
import { isLocale, messages } from "@/lib/i18n";
export default async function NotFound() {
  const value = (await headers()).get("x-facefind-locale") || "az";
  const locale = isLocale(value) ? value : "az";
  const t = messages[locale];
  return (
    <main className="privacy">
      <p className="eyebrow">{t.brand}</p>
      <h1>{t.notFound}</h1>
      <Link href={`/${locale}`}>{t.login}</Link>
    </main>
  );
}
