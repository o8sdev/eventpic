"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { messages, type Locale } from "@/lib/i18n";
export function EventShare({
  locale,
  eventId,
  url,
}: {
  locale: Locale;
  eventId: string;
  url: string;
}) {
  const router = useRouter();
  const t = messages[locale].phase2;
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  async function download(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (downloading) return;
    const target = event.currentTarget;
    setDownloading(true);
    setDownloadError(false);
    try {
      const response = await fetch(target.href, { cache: "no-store" });
      if (response.status === 401) {
        router.push(`/${locale}/login`);
        return;
      }
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "SnapMatch";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  return (
    <section className="card event-share">
      <div>
        <p className="eyebrow">{t.share}</p>
        <h2>{t.guestLink}</h2>
        <p className="muted">{t.shareHelp}</p>
        <div className="copy-link">
          <input aria-label={t.guestLink} readOnly value={url} />
          <button className="small-button" onClick={copy}>
            {copied ? t.copied : t.copy}
          </button>
        </div>
        {failed && <p role="status">{t.copyHelp}</p>}
        <div className="share-downloads">
          <a
            className="button button-secondary"
            href={`/api/events/${eventId}/qr`}
            onClick={download}
            aria-disabled={downloading}
          >
            {t.qrDownload}
          </a>
          <a
            className="button button-secondary"
            href={`/api/events/${eventId}/poster?locale=${locale}`}
            onClick={download}
            aria-disabled={downloading}
          >
            {t.posterDownload}
          </a>
        </div>
        {downloadError && (
          <p className="notice" role="alert">
            {t.downloadError}
          </p>
        )}
        <p className="phase-note">{t.guestPending}</p>
      </div>
      <Image
        unoptimized
        src={`/api/events/${eventId}/qr?inline=1`}
        width={160}
        height={160}
        alt={t.qrAlt}
      />
    </section>
  );
}
