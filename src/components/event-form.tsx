"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { messages, type Locale } from "@/lib/i18n";
import {
  bakuDate,
  defaultExpiry,
  type PhotographerEvent,
} from "@/lib/events/schema";
import { saveEvent } from "@/app/[locale]/dashboard/events/actions";
import { SubmitButton } from "./submit-button";
export function EventForm({
  locale,
  id,
  event,
  watermarkLocked = false,
}: {
  locale: Locale;
  id: string;
  event?: PhotographerEvent;
  watermarkLocked?: boolean;
}) {
  const t = messages[locale].phase2;
  const [state, action] = useActionState(saveEvent, { notice: "" });
  const [date, setDate] = useState(event?.event_date || "");
  const [expiry, setExpiry] = useState(
    event ? bakuDate(event.face_expires_at) : "",
  );
  return (
    <form action={action} className="event-form card">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="languages" value="en" />
      <input type="hidden" name="default_locale" value="en" />
      {state.notice && (
        <p className="notice" role="alert">
          {(t[state.notice as keyof typeof t] as string) || t.saveError}
        </p>
      )}
      <div className="event-form-grid">
        <div>
          <label htmlFor="title">{t.title}</label>
          <input
            id="title"
            name="title"
            required
            maxLength={200}
            defaultValue={event?.title}
          />
        </div>
        <div>
          <label htmlFor="event_date">{t.date}</label>
          <input
            id="event_date"
            name="event_date"
            type="date"
            required
            min="1900-01-01"
            max="2100-12-31"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="full-field">
          <label htmlFor="venue">{t.venue}</label>
          <input
            id="venue"
            name="venue"
            maxLength={300}
            defaultValue={event?.venue || ""}
          />
        </div>
        <div className="full-field">
          <label htmlFor="cover">{t.cover}</label>
          <input
            id="cover"
            name="cover"
            type="file"
            accept="image/jpeg,image/png"
          />
          <small>{event ? t.replaceCover : t.coverHelp}</small>
        </div>
        <div className="full-field settings-toggles">
          <label className="toggle-field">
            <input
              name="allow_original_download"
              type="checkbox"
              defaultChecked={event?.allow_original_download || false}
            />
            <span>
              {t.originals}
              <small>{t.originalsHelp}</small>
            </span>
          </label>
          {watermarkLocked && (
            <input
              name="watermark_enabled"
              type="hidden"
              value={event?.watermark_enabled ? "on" : "off"}
            />
          )}
          <label className="toggle-field">
            <input
              name={watermarkLocked ? undefined : "watermark_enabled"}
              type="checkbox"
              disabled={watermarkLocked}
              defaultChecked={event?.watermark_enabled ?? true}
            />
            <span>
              {t.watermark}
              <small>
                {watermarkLocked ? t.watermarkLocked : t.watermarkHelp}
              </small>
            </span>
          </label>
        </div>
        <div className="full-field">
          <label htmlFor="expiry">{t.expiry}</label>
          <input
            id="expiry"
            name="expiry"
            type="date"
            required={Boolean(event)}
            min={date || "1900-01-01"}
            max="2200-12-31"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
          <small>
            {event
              ? t.expiryEdit
              : `${t.expiryDefault} ${defaultExpiry(date) || "—"}`}
          </small>
        </div>
      </div>
      <div className="form-actions">
        <SubmitButton
          label={event ? t.save : t.create}
          pending={messages[locale].saving}
        />
        <Link
          className="button button-secondary"
          href={
            event ? `/${locale}/dashboard/events/${id}` : `/${locale}/dashboard`
          }
        >
          {t.cancel}
        </Link>
      </div>
    </form>
  );
}
