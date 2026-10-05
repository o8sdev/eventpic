import { notFound, redirect } from "next/navigation";
import { isLocale, messages } from "@/lib/i18n";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { signIn } from "./actions";
import { SubmitButton } from "@/components/submit-button";
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
    if (user) redirect(`/${locale}/dashboard`);
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
  return (
    <div className="landing">
      <section className="hero">
        <p className="eyebrow">{t.photographers}</p>
        <h1>{t.tagline}</h1>
        <p className="intro">{t.intro}</p>
        <div className="art" aria-hidden="true">
          <div className="arch arch-back" />
          <div className="arch arch-front">
            <span>✧</span>
          </div>
          <span className="art-caption">{t.brand}</span>
        </div>
      </section>
      <section className="card login-card">
        <span className="small-flower" aria-hidden="true">
          ✧
        </span>
        <h2>{configured ? t.login : t.setup}</h2>
        {configured ? (
          <form action={signIn}>
            <input name="locale" type="hidden" value={locale} />
            <label htmlFor="email">{t.email}</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
            />
            <SubmitButton label={t.send} pending={t.sending} />
            {noticeText && (
              <p role="status" className="notice">
                {noticeText}
              </p>
            )}
          </form>
        ) : (
          <p className="muted">{t.setupBody}</p>
        )}
      </section>
    </div>
  );
}
