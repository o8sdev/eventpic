import { messages, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/lib/site/schema";
export function LegalPage({
  locale,
  content,
  kind,
}: {
  locale: Locale;
  content: SiteContent;
  kind: "privacy" | "terms";
}) {
  const m = messages[locale].modern;
  const legal = content.legal;
  return (
    <article className="legal-page">
      <span className="eyebrow">SnapMatch</span>
      <h1>{kind === "privacy" ? legal.privacyTitle : legal.termsTitle}</h1>
      {!(kind === "privacy" ? legal.privacyReviewed : legal.termsReviewed) && (
        <p className="notice">{m.draftNotice}</p>
      )}
      <div className="legal-copy">
        {(kind === "privacy" ? legal.privacyBody : legal.termsBody)
          .split("\n")
          .map((p, i) => (
            <p key={i}>{p}</p>
          ))}
      </div>
    </article>
  );
}
