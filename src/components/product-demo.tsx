"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { messages, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/lib/site/schema";
import { Icon } from "./icon";

function Phone({
  step,
  locale,
  content,
}: {
  step: number;
  locale: Locale;
  content: SiteContent;
}) {
  const m = messages[locale].modern;
  return (
    <div className="demo-phone">
      <div className="phone-top">
        <span />
        <span className="phone-speaker" />
        <Icon name="lock" size={12} />
      </div>
      <div className="phone-brand">
        <Image src={content.branding.iconPath} width={24} height={24} alt="" />
        SnapMatch
      </div>
      <div className="phone-screen" key={step}>
        {step === 0 ? (
          <>
            <div className="phone-cover">
              <Image
                src={content.branding.heroImage}
                alt={content.branding.imageAlt}
                fill
                sizes="300px"
              />
            </div>
            <span className="demo-label">{m.preview}</span>
            <h3>{m.eventTitle}</h3>
            <p>{m.scanBody}</p>
            <div className="demo-qr" aria-hidden="true">
              <Icon name="scan" size={58} />
            </div>
            <span className="phone-button">
              {m.continue}
              <Icon name="arrow" size={14} />
            </span>
          </>
        ) : step === 1 ? (
          <>
            <span className="demo-label">{m.preview}</span>
            <h3>{m.consent}</h3>
            <div className="consent-example">
              <Icon name="check" size={15} />
              <p>{m.faceHint}</p>
            </div>
            <div className="selfie-guide">
              <div className="face-outline">
                <span />
                <span />
                <i />
              </div>
              <span className="guide-corner a" />
              <span className="guide-corner b" />
              <span className="guide-corner c" />
              <span className="guide-corner d" />
            </div>
            <span className="phone-button">
              <Icon name="camera" size={16} />
              {m.selfie}
            </span>
          </>
        ) : (
          <>
            <span className="demo-label">{m.preview}</span>
            <h3>{m.galleryTitle}</h3>
            <p>{m.matchedLabel}</p>
            <div className="demo-grid">
              {(content.branding.examplePhotos || [])
                .slice(0, 4)
                .map((photo, i) => (
                  <div key={i}>
                    <Image
                      src={photo.image}
                      alt={photo.alt}
                      fill
                      sizes="140px"
                    />
                  </div>
                ))}
            </div>
            <span className="phone-button">
              <Icon name="image" size={16} />
              {m.download}
            </span>
          </>
        )}
      </div>
      <div className="phone-home" />
    </div>
  );
}
export function StudioDemo({
  locale,
  content,
}: {
  locale: Locale;
  content: SiteContent;
}) {
  const m = messages[locale].modern;
  return (
    <div className="studio-demo">
      <div className="studio-demo-bar">
        <span className="window-dots">● ● ●</span>
        <span>{m.photographer}</span>
        <Icon name="lock" size={13} />
      </div>
      <div className="studio-demo-body">
        <div className="studio-demo-sidebar">
          <Image
            src={content.branding.iconPath}
            width={28}
            height={28}
            alt=""
          />
          {["image", "upload", "scan", "spark"].map((n) => (
            <span key={n}>
              <Icon name={n} size={17} />
            </span>
          ))}
        </div>
        <div className="studio-demo-main">
          <span className="demo-label">{m.preview}</span>
          <h3>{m.studioEvent}</h3>
          <div className="upload-example">
            <Icon name="upload" size={26} />
            <strong>{m.studioUpload}</strong>
            <span>JPEG</span>
          </div>
          <div className="processing-example">
            <span>{m.studioProgress}</span>
            <div>
              <i />
            </div>
          </div>
          <div className="studio-mini-grid">
            {(content.branding.examplePhotos || [])
              .slice(0, 3)
              .map((photo, n) => (
                <div key={n}>
                  <Image src={photo.image} alt={photo.alt} fill sizes="150px" />
                  <span>
                    <Icon name="check" size={11} />
                  </span>
                </div>
              ))}
          </div>
          <div className="studio-demo-bottom">
            <span>
              <Icon name="scan" />
              {m.studioQr}
            </span>
            <span>
              <Icon name="spark" />
              {m.studioStats}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
export function ProductDemo({
  locale,
  content,
}: {
  locale: Locale;
  content: SiteContent;
}) {
  const [mode, setMode] = useState("guest");
  const [step, setStep] = useState(2);
  const m = messages[locale].modern;
  return (
    <div className="product-demo">
      <div className="demo-switch" role="group" aria-label={m.preview}>
        <button
          aria-pressed={mode === "guest"}
          onClick={() => setMode("guest")}
        >
          {m.guest}
        </button>
        <button
          aria-pressed={mode === "studio"}
          onClick={() => setMode("studio")}
        >
          {m.photographer}
        </button>
      </div>
      <div className="demo-stage">
        {mode === "guest" ? (
          <>
            <div className="orb orb-one" />
            <div className="orb orb-two" />
            <Phone step={step} locale={locale} content={content} />
            <div className="floating-pill pill-top">
              <Icon name="shield" size={17} />
              {m.faceHint}
            </div>
            <div className="floating-pill pill-bottom">
              <Icon name="spark" size={17} />
              {m.galleryPreview}
            </div>
          </>
        ) : (
          <StudioDemo locale={locale} content={content} />
        )}
      </div>
      {mode === "guest" && (
        <div
          className="demo-step-controls"
          role="group"
          aria-label={m.stepLabel}
        >
          {[m.scan, m.selfie, m.photos].map((label, i) => (
            <button
              key={label}
              aria-pressed={step === i}
              onClick={() => setStep(i)}
            >
              <span>0{i + 1}</span>
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="demo-disclaimer">{m.demoNote}</p>
    </div>
  );
}
export function Walkthrough({
  locale,
  content,
}: {
  locale: Locale;
  content: SiteContent;
}) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const m = messages[locale].modern;
  useEffect(() => {
    const nodes = ref.current?.querySelectorAll("[data-demo-step]");
    if (!nodes) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0])
          setActive(Number(visible[0].target.getAttribute("data-demo-step")));
      },
      { rootMargin: "-15% 0px -35% 0px", threshold: [0, 0.2, 0.5, 0.8] },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);
  return (
    <div className="scroll-walkthrough" ref={ref}>
      <div className="walkthrough-device">
        <Phone step={Math.min(active, 2)} locale={locale} content={content} />
        <p className="demo-disclaimer">{m.preview}</p>
      </div>
      <div className="walkthrough-steps">
        {content.walkthrough.steps.map((step, i) => (
          <article
            data-demo-step={i}
            key={i}
            className={active === i ? "walk-step active" : "walk-step"}
          >
            <span className="step-number">0{i + 1}</span>
            <div>
              <span className="step-icon">
                <Icon name={["scan", "camera", "image", "spark"][i]} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
