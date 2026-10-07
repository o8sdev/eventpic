"use client";
import { useParams } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { locale } = useParams<{ locale: string }>();
  const t = messages[isLocale(locale) ? locale : "en"];
  return (
    <section className="privacy">
      <p role="alert">{t.loadError}</p>
      <button className="button" onClick={reset}>
        {t.retry}
      </button>
    </section>
  );
}
