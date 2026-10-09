"use client";
import { SiteNavLink as Link } from "./site-nav-link";
import { usePathname } from "next/navigation";
import { messages, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/lib/site/schema";
import { SiteHeader } from "./site-header";

export function SiteChrome({
  locale,
  content,
  children,
  preview = false,
  pricingVisible = false,
}: {
  locale: Locale;
  content: SiteContent;
  children: React.ReactNode;
  preview?: boolean;
  pricingVisible?: boolean;
}) {
  const path = usePathname();
  const t = messages[locale];
  const m = t.modern;
  if (path.includes("/admin") && !preview) return <>{children}</>;
  const editorial = preview || !path.includes("/dashboard");
  const nav = [
    {
      label: content.navigation.how,
      id: "how-it-works",
      show: content.sections.how,
    },
    {
      label: content.navigation.studio,
      id: "photographers",
      show: content.sections.studio,
    },
    {
      label: m.privacy,
      id: "privacy",
      show: content.sections.privacy,
    },
    {
      label: content.navigation.faq,
      id: "questions",
      show: content.sections.faq,
    },
  ].filter((n) => n.show);
  const logo = (
    <span className="wordmark">
      <span className="wordmark-symbol" aria-hidden="true">
        <i />
        <i />
      </span>
      <span>{t.brand}</span>
    </span>
  );
  return (
    <>
      <SiteHeader
        locale={locale}
        content={content}
        editorial={editorial}
        logo={logo}
        pricingVisible={pricingVisible}
      />
      <main id="top">{children}</main>
      <footer className={`site-footer${editorial ? " editorial-footer" : ""}`}>
        <div className="footer-top">
          <div className="footer-intro">
            <Link href={`/${locale}`} className="brand">
              {logo}
            </Link>
            <p>{content.footer.description}</p>
            <div className="social-links">
              {(["instagram", "facebook", "linkedin"] as const).map(
                (key) =>
                  content.company[key] && (
                    <a
                      key={key}
                      href={content.company[key]}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {key === "instagram"
                        ? "Instagram"
                        : key === "facebook"
                          ? "Facebook"
                          : "LinkedIn"}
                      <span aria-hidden="true">↗</span>
                    </a>
                  ),
              )}
            </div>
          </div>
          <div>
            <h3>{content.footer.product}</h3>
            {nav.map((n) => (
              <Link key={n.id} href={`/${locale}#${n.id}`}>
                {n.label}
              </Link>
            ))}
            <Link href={`/${locale}/login`}>{content.navigation.signIn}</Link>
            {pricingVisible && (
              <Link href={`/${locale}#pricing`}>{t.billing.pricing}</Link>
            )}
          </div>
          <div>
            <h3>{content.footer.company}</h3>
            <Link
              href={`/${locale}${content.sections.studio ? "#photographers" : ""}`}
            >
              {m.about}
            </Link>
            <Link href={`/${locale}/contact`}>{content.footer.contact}</Link>
            <p>{content.company.legalName}</p>
            {content.company.registrationNumber && (
              <small>{content.company.registrationNumber}</small>
            )}
          </div>
          <div>
            <h3>{content.footer.legal}</h3>
            <Link href={`/${locale}/privacy`}>{m.privacy}</Link>
            <Link href={`/${locale}/terms`}>{m.terms}</Link>
          </div>
          <div>
            <h3>{content.footer.contact}</h3>
            {content.company.email && (
              <a href={`mailto:${content.company.email}`}>
                {content.company.email}
              </a>
            )}
            {content.company.phone && (
              <a href={`tel:${content.company.phone.replace(/[^+\d]/g, "")}`}>
                {content.company.phone}
              </a>
            )}
            {content.company.address && <p>{content.company.address}</p>}
            {!content.company.email &&
              !content.company.phone &&
              !content.company.address && (
                <Link href={`/${locale}/contact`}>
                  {content.footer.contact}
                </Link>
              )}
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {content.company.legalName || t.brand}.{" "}
            {content.footer.copyright}
          </span>
          <a href="#top">
            {m.backTop}
            <span aria-hidden="true">↑</span>
          </a>
        </div>
      </footer>
    </>
  );
}
