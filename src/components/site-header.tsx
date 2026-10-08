"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { messages, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/lib/site/schema";
import { Icon } from "./icon";

export function SiteHeader({
  locale,
  content,
  editorial,
  logo,
}: {
  locale: Locale;
  content: SiteContent;
  editorial: boolean;
  logo: React.ReactNode;
}) {
  const t = messages[locale];
  const n = t.navigation;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<"product" | "resources" | null>(
    null,
  );
  const header = useRef<HTMLElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const productTrigger = useRef<HTMLButtonElement>(null);
  const resourcesTrigger = useRef<HTMLButtonElement>(null);
  const base = `/${locale}`;
  const close = () => {
    setExpanded(null);
    setMobileOpen(false);
  };

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!header.current?.contains(event.target as Node)) {
        setExpanded(null);
        setMobileOpen(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (expanded) {
        (expanded === "product"
          ? productTrigger
          : resourcesTrigger
        ).current?.focus();
        setExpanded(null);
      } else if (mobileOpen) {
        mobileTrigger.current?.focus();
        setMobileOpen(false);
      }
    }
    // Keep hidden desktop disclosures closed when switching to the mobile menu.
    function resize() {
      setExpanded(null);
      setMobileOpen(false);
    }
    const breakpoint = window.matchMedia("(max-width: 850px)");
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    breakpoint.addEventListener("change", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      breakpoint.removeEventListener("change", resize);
    };
  }, [expanded, mobileOpen]);

  const product = [
    {
      title: content.navigation.studio,
      description: n.workspaceDescription,
      href: `${base}#photographers`,
      icon: "image",
      show: content.sections.studio,
    },
    {
      title: content.navigation.how,
      description: n.workflowDescription,
      href: `${base}#how-it-works`,
      icon: "upload",
      show: content.sections.how,
    },
    {
      title: n.privacy,
      description: n.privacyDescription,
      href: `${base}#privacy`,
      icon: "shield",
      show: content.sections.privacy,
    },
  ].filter((item) => item.show);
  const resources = [
    {
      title: n.help,
      description: n.helpDescription,
      href: `${base}/contact`,
      icon: "arrow",
    },
    ...(content.sections.faq
      ? [
          {
            title: content.navigation.faq,
            description: n.faqDescription,
            href: `${base}#questions`,
            icon: "scan",
          },
        ]
      : []),
  ];

  return (
    <header
      ref={header}
      className={`site-header product-header${editorial ? " editorial-header" : ""}`}
    >
      <div className="nav-inner">
        <Link href={base} className="brand" onClick={close}>
          {logo}
        </Link>
        <nav className="desktop-nav" aria-label={n.primary}>
          {(["product", "resources"] as const).map((group) => {
            if (group === "product" && product.length === 0) return null;
            const items = group === "product" ? product : resources;
            const active = expanded === group;
            return (
              <Fragment key={group}>
                <div
                  className={`nav-disclosure nav-${group}`}
                  onBlur={(event) => {
                    if (
                      !event.currentTarget.contains(event.relatedTarget as Node)
                    )
                      setExpanded((current) =>
                        current === group ? null : current,
                      );
                  }}
                >
                  <button
                    ref={
                      group === "product" ? productTrigger : resourcesTrigger
                    }
                    type="button"
                    className="nav-trigger"
                    aria-expanded={active}
                    aria-controls={`nav-${group}`}
                    onClick={() => setExpanded(active ? null : group)}
                  >
                    {n[group]}
                    <span className="nav-chevron" aria-hidden="true" />
                  </button>
                  {active && (
                    <div className="nav-dropdown" id={`nav-${group}`}>
                      <span className="nav-dropdown-label">{n[group]}</span>
                      {items.map((item) => (
                        <Link
                          className="nav-dropdown-link"
                          href={item.href}
                          key={item.href}
                          onClick={close}
                        >
                          <span className="nav-link-icon">
                            <Icon name={item.icon} size={19} />
                          </span>
                          <span>
                            <strong>{item.title}</strong>
                            <small>{item.description}</small>
                          </span>
                          <span className="nav-link-arrow" aria-hidden="true">
                            ↗
                          </span>
                        </Link>
                      ))}
                      {group === "resources" && (
                        <div className="nav-dropdown-legal">
                          <Link href={`${base}/privacy`} onClick={close}>
                            {n.privacyPolicy}
                          </Link>
                          <Link href={`${base}/terms`} onClick={close}>
                            {n.terms}
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {group === "product" && content.sections.how && (
                  <Link
                    className="nav-workflow"
                    href={`${base}#how-it-works`}
                    onClick={close}
                  >
                    {content.navigation.how}
                  </Link>
                )}
              </Fragment>
            );
          })}
          <Link
            className="nav-contact"
            href={`${base}/contact`}
            onClick={close}
          >
            {n.contact}
          </Link>
        </nav>
        <div className="header-actions">
          <Link className="header-login" href={`${base}/login`} onClick={close}>
            {content.navigation.signIn}
            <Icon name="arrow" size={16} />
          </Link>
          <button
            ref={mobileTrigger}
            type="button"
            className="menu-toggle"
            aria-label={mobileOpen ? t.modern.closeMenu : t.modern.menu}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => {
              setMobileOpen(!mobileOpen);
              setExpanded(null);
            }}
          >
            <Icon name={mobileOpen ? "close" : "menu"} />
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav
          id="mobile-menu"
          className="mobile-nav product-mobile-nav"
          aria-label={n.primary}
        >
          {product.length > 0 && (
            <div>
              <span className="nav-dropdown-label">{n.product}</span>
              {product.map((item) => (
                <Link href={item.href} key={item.href} onClick={close}>
                  {item.title}
                  <Icon name="arrow" size={16} />
                </Link>
              ))}
            </div>
          )}
          <div>
            <span className="nav-dropdown-label">{n.resources}</span>
            {resources.map((item) => (
              <Link href={item.href} key={item.href} onClick={close}>
                {item.title}
                <Icon name="arrow" size={16} />
              </Link>
            ))}
            <Link href={`${base}/privacy`} onClick={close}>
              {n.privacyPolicy}
            </Link>
            <Link href={`${base}/terms`} onClick={close}>
              {n.terms}
            </Link>
          </div>
          <Link
            className="mobile-signin"
            href={`${base}/login`}
            onClick={close}
          >
            {content.navigation.signIn}
            <Icon name="arrow" size={16} />
          </Link>
        </nav>
      )}
      <div className="scroll-progress" />
    </header>
  );
}
