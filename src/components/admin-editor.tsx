"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { messages, type Locale } from "@/lib/i18n";
import {
  siteContentSchema,
  siteImagePaths,
  sitePhotoPaths,
  type SiteContent,
} from "@/lib/site/schema";
import { changeContent, saveDraft } from "@/app/[locale]/admin/actions";
import { SubmitButton } from "./submit-button";

type FieldValue =
  string | boolean | FieldValue[] | { [key: string]: FieldValue };
export function AdminEditor({
  locale,
  initial,
  version,
  notice,
}: {
  locale: Locale;
  initial: SiteContent;
  version: number;
  notice?: string;
}) {
  const t = messages[locale].admin;
  const [saveState, saveAction] = useActionState(saveDraft, { notice: "" });
  const [content, setContent] = useState<SiteContent>(initial);
  const [group, setGroup] = useState<keyof SiteContent>("hero");
  const dirty = JSON.stringify(content) !== JSON.stringify(initial);
  const valid = siteContentSchema.safeParse(content).success;
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function update(path: (string | number)[], value: FieldValue) {
    setContent((previous) => {
      const next = structuredClone(previous);
      let pointer = next as unknown as Record<string | number, unknown>;
      for (const key of path.slice(0, -1))
        pointer = pointer[key] as Record<string | number, unknown>;
      pointer[path[path.length - 1]] = value;
      return next;
    });
  }
  const labels = t.labels as Record<string, string>;
  const assetLabels: Record<string, string> = {
    "/images/event-birthday.webp": t.assetBirthday,
    "/images/event-corporate.webp": t.assetCorporate,
    "/images/event-concert.webp": t.assetConcert,
    "/images/event-graduation.webp": t.assetGraduation,
    "/images/event-family.webp": t.assetFamily,
    "/images/wedding-editorial.png": t.assetHero,
    "/images/wedding-reception.webp": t.assetReception,
    "/images/wedding-dance.webp": t.assetDance,
    "/images/wedding-friends.webp": t.assetFriends,
    "/brand/snapmatch-logo.png": t.assetLogo,
    "/brand/snapmatch-icon.png": t.assetIcon,
  };
  function render(
    value: FieldValue,
    path: (string | number)[],
    key: string,
  ): React.ReactNode {
    // Preserve historical CMS documents, while hiding controls for retired UI.
    if (
      [
        "hero.primary",
        "walkthrough.examplesTitle",
        "walkthrough.examplesDescription",
        "walkthrough.showExamples",
        "branding.logoPath",
        "branding.heroImage",
        "branding.imageAlt",
        "branding.examplePhotos",
      ].includes(path.join("."))
    )
      return null;
    const id = `field-${path.join("-")}`;
    const label = labels[key] || t.groups[group];
    if (typeof value === "boolean")
      return (
        <label className="toggle-field" key={id}>
          <input
            id={id}
            type="checkbox"
            checked={value}
            onChange={(e) => update(path, e.target.checked)}
          />
          <span>{label}</span>
        </label>
      );
    if (typeof value === "string") {
      if (
        siteImagePaths.includes(value as (typeof siteImagePaths)[number]) &&
        ["branding", "seo"].includes(group)
      )
        return (
          <div className="editor-field" key={id}>
            <label htmlFor={id}>{label}</label>
            <select
              id={id}
              value={value}
              onChange={(e) => update(path, e.target.value)}
            >
              {(path.includes("examplePhotos")
                ? sitePhotoPaths
                : siteImagePaths
              ).map((asset) => (
                <option key={asset} value={asset}>
                  {assetLabels[asset]}
                </option>
              ))}
            </select>
            <small>{t.assetHelp}</small>
          </div>
        );
      const multiline = /body|description|answer/i.test(key);
      return (
        <div className="editor-field" key={id}>
          <label htmlFor={id}>{label}</label>
          {multiline ? (
            <textarea
              id={id}
              value={value}
              rows={key.endsWith("Body") ? 10 : 4}
              onChange={(e) => update(path, e.target.value)}
            />
          ) : (
            <input
              id={id}
              value={value}
              type={key === "email" ? "email" : "text"}
              placeholder={group === "company" ? label : undefined}
              onChange={(e) => update(path, e.target.value)}
            />
          )}
        </div>
      );
    }
    if (Array.isArray(value)) {
      const minimum =
        group === "walkthrough" || key === "examplePhotos" ? 3 : 1;
      const maximum = group === "walkthrough" ? 4 : group === "faqs" ? 12 : 6;
      if (key === "order")
        return (
          <div className="editor-field" key={id}>
            <label>{label}</label>
            {value.map((item, i) => (
              <div className="order-item" key={String(item)}>
                <span>
                  {t.groups[item as keyof typeof t.groups] ||
                    labels[String(item)]}
                </span>
                <div>
                  {[-1, 1].map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      className="small-button"
                      disabled={
                        i + direction < 0 || i + direction >= value.length
                      }
                      onClick={() => {
                        const next = [...value];
                        [next[i], next[i + direction]] = [
                          next[i + direction],
                          next[i],
                        ];
                        update(path, next);
                      }}
                    >
                      {direction < 0 ? t.moveUp : t.moveDown}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      return (
        <fieldset className="array-editor" key={id}>
          <legend>{label}</legend>
          {value.map((item, i) => (
            <div className="array-item" key={i}>
              <div className="array-item-heading">
                <span>
                  {label} {i + 1}
                </span>
                <div>
                  {[-1, 1].map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      className="small-button"
                      disabled={
                        i + direction < 0 || i + direction >= value.length
                      }
                      onClick={() => {
                        const next = [...value];
                        [next[i], next[i + direction]] = [
                          next[i + direction],
                          next[i],
                        ];
                        update(path, next);
                      }}
                    >
                      {direction < 0 ? t.moveUp : t.moveDown}
                    </button>
                  ))}
                  <button
                    className="small-button"
                    type="button"
                    disabled={value.length <= minimum}
                    onClick={() =>
                      update(
                        path,
                        value.filter((_, index) => index !== i),
                      )
                    }
                  >
                    {t.remove}
                  </button>
                </div>
              </div>
              {render(item, [...path, i], key)}
            </div>
          ))}
          <button
            className="small-button"
            type="button"
            disabled={value.length >= maximum}
            onClick={() =>
              update(path, [
                ...value,
                key === "examplePhotos"
                  ? { image: sitePhotoPaths[0], alt: "", label: "" }
                  : group === "faqs"
                    ? { question: "", answer: "" }
                    : { title: "", body: "" },
              ])
            }
          >
            {t.add}
          </button>
        </fieldset>
      );
    }
    return (
      <div className="editor-fields" key={id}>
        {Object.entries(value).map(([field, item]) =>
          render(item, [...path, field], field),
        )}
      </div>
    );
  }
  const groups = Object.keys(initial) as (keyof SiteContent)[];
  return (
    <>
      <div className="admin-heading">
        <div>
          <span className="eyebrow">{t.title}</span>
          <h1>{t.editor}</h1>
          <p>{t.editorHelp}</p>
        </div>
        <span className="version-badge">
          {t.version} {version}
        </span>
      </div>
      {(saveState.notice || notice) && (
        <p role="status" className="notice">
          {(t[(saveState.notice || notice) as keyof typeof t] as string) ||
            t.error}
        </p>
      )}
      <div className="editor-layout">
        <nav className="editor-tabs" aria-label={t.editor}>
          {groups.map((key) => (
            <button
              key={key}
              onClick={() => setGroup(key)}
              aria-pressed={group === key}
            >
              {t.groups[key]}
            </button>
          ))}
        </nav>
        <div>
          <form action={saveAction} className="editor-card">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="version" value={version} />
            <input type="hidden" name="action" value="save" />
            <input
              type="hidden"
              name="content"
              value={JSON.stringify(content)}
            />
            <div className="editor-card-heading">
              <h2>{t.groups[group]}</h2>
              <span className={dirty ? "dirty-badge" : "version-badge"}>
                {dirty ? t.unsaved : t.draft}
              </span>
            </div>
            {render(content[group] as unknown as FieldValue, [group], group)}
            {!valid && (
              <p className="form-error" role="status">
                {t.invalid}
              </p>
            )}
            <div className="editor-save">
              <SubmitButton
                label={t.save}
                pending={messages[locale].sending}
                disabled={!valid}
              />
            </div>
          </form>
          <div className="publish-card">
            <div>
              <h3>{t.publish}</h3>
              <p>{t.publishHelp}</p>
            </div>
            <div className="publish-actions">
              <Link
                className="button button-secondary"
                href={`/${locale}/admin/preview`}
                target="_blank"
              >
                {t.preview} ↗
              </Link>
              <form action={changeContent}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="version" value={version} />
                <input type="hidden" name="action" value="publish" />
                <button
                  className="button"
                  type="submit"
                  disabled={dirty || !valid || version === 0}
                >
                  {t.publish}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
