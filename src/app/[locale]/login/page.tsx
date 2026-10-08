import { notFound, redirect } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { signIn } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { Icon } from "@/components/icon";
export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages[locale];
  const configured = isConfigured();
  if (configured) {
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) {
      const { data: admin } = await client.rpc("is_system_admin");
      redirect(`/${locale}/${admin === true ? "admin" : "dashboard"}`);
    }
  }
  const { notice } = await searchParams;
  const noticeText =
    notice === "sent"
      ? t.sent
      : notice === "invalid"
        ? t.invalid
        : notice === "authError"
          ? t.authError
          : "";
  const error = notice === "invalid" || notice === "authError";
  return (
    <div className="signin-page">
      <div className="signin-shell">
        <Link className="signin-back" href={`/${locale}`}>
          <span aria-hidden="true">←</span> {t.landing.home}
        </Link>
        <div className="signin-layout">
          <section className="signin-intro">
            <p className="signin-kicker">{t.signin.eyebrow}</p>
            <h1>
              {t.signin.title}
              <span>{t.signin.accent}</span>
            </h1>
            <p className="signin-description">{t.landing.loginBody}</p>
            <ul className="signin-topics" aria-label={t.signin.workspaceLabel}>
              {t.signin.topics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          </section>
          <section className="signin-panel" aria-labelledby="signin-title">
            <div className="signin-panel-heading">
              <span className="signin-key" aria-hidden="true">
                <Icon name="lock" size={20} />
              </span>
              <span className="signin-kicker">{t.signin.access}</span>
            </div>
            <h2 id="signin-title">{configured ? t.login : t.setup}</h2>
            {configured ? (
              <>
                <p className="signin-hint" id="signin-hint">
                  {t.landing.loginHint}
                </p>
                {noticeText && (
                  <p
                    id="signin-notice"
                    role={error ? "alert" : "status"}
                    className={`signin-notice${error ? " signin-notice-error" : ""}`}
                  >
                    {noticeText}
                  </p>
                )}
                <form action={signIn}>
                  <input name="locale" type="hidden" value={locale} />
                  <label htmlFor="email">{t.email}</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    required
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={254}
                    placeholder={t.signin.emailPlaceholder}
                    aria-invalid={notice === "invalid" || undefined}
                    aria-describedby={
                      error ? "signin-hint signin-notice" : "signin-hint"
                    }
                  />
                  <SubmitButton label={t.send} pending={t.sending} />
                </form>
                <p className="signin-account-note">{t.signin.accountNote}</p>
              </>
            ) : (
              <p className="signin-hint">{t.setupBody}</p>
            )}
            <div className="signin-help">
              <span>{t.signin.help}</span>
              <Link href={`/${locale}/contact`}>
                {t.modern.contact}
                <Icon name="arrow" size={16} />
              </Link>
            </div>
          </section>
        </div>
        <div className="signin-bottom">
          <span>{t.signin.footnote}</span>
          <nav aria-label={t.modern.legal}>
            <Link href={`/${locale}/privacy`}>{t.privacy}</Link>
            <Link href={`/${locale}/terms`}>{t.modern.terms}</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
