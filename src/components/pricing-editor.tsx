"use client";
import { useActionState, useState } from "react";
import { messages, type Locale } from "@/lib/i18n";
import { type Pricing, type Plan, GB } from "@/lib/billing/schema";
import { savePricing } from "@/app/[locale]/admin/plans/actions";
import { PricingSection } from "./pricing-section";
import { SubmitButton } from "./submit-button";

export function PricingEditor({
  initial,
  revision,
  locale,
  history,
}: {
  initial: Pricing;
  revision: number;
  locale: Locale;
  history: { revision: number; published: boolean }[];
}) {
  const [value, setValue] = useState(initial);
  const [state, action] = useActionState(savePricing, { notice: "" });
  const t = messages[locale].billing,
    a = messages[locale].admin;
  const update = (index: number, patch: Partial<Plan>) =>
    setValue((v) => ({
      ...v,
      plans: v.plans.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  const move = (i: number, d: number) =>
    setValue((v) => {
      const plans = [...v.plans];
      [plans[i], plans[i + d]] = [plans[i + d], plans[i]];
      return { ...v, plans };
    });
  return (
    <>
      <form action={action} className="pricing-editor">
        <input type="hidden" name="operation" value="save" />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="revision" value={revision} />
        <input type="hidden" name="document" value={JSON.stringify(value)} />
        {state.notice && (
          <p className="notice" role="alert">
            {(a[state.notice as keyof typeof a] as string) || a.error}
          </p>
        )}
        <section className="admin-card">
          <h2>{t.sectionCopy}</h2>
          {(["heading", "description", "cta", "note"] as const).map((k) => (
            <label className="field" key={k}>
              {t.fields[k]}
              <textarea
                required
                maxLength={k === "note" ? 1200 : 240}
                value={value[k]}
                onChange={(e) => setValue({ ...value, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="check-row">
            <input
              type="checkbox"
              checked={value.visible}
              onChange={(e) =>
                setValue({ ...value, visible: e.target.checked })
              }
            />
            {t.showPricing}
          </label>
        </section>
        {value.plans.map((plan, index) => (
          <section className="admin-card" key={plan.code}>
            <div className="plan-editor-title">
              <h2>{plan.name}</h2>
              <span>{plan.code}</span>
              <button
                type="button"
                className="small-button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={`${t.moveUp} ${plan.name}`}
              >
                ↑
              </button>
              <button
                type="button"
                className="small-button"
                disabled={index === value.plans.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`${t.moveDown} ${plan.name}`}
              >
                ↓
              </button>
            </div>
            <div className="billing-form-grid">
              {(["name", "description"] as const).map((k) => (
                <label className="field" key={k}>
                  {t.fields[k]}
                  <input
                    required
                    maxLength={240}
                    value={plan[k]}
                    onChange={(e) => update(index, { [k]: e.target.value })}
                  />
                </label>
              ))}
              <label className="field">
                {t.fields.price}
                <input
                  type="number"
                  required
                  min="0"
                  max="1000000"
                  step="0.01"
                  disabled={plan.code === "trial"}
                  value={plan.price_minor / 100}
                  onChange={(e) =>
                    update(index, {
                      price_minor: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
              {(
                [
                  ["photos", t.photos, 1],
                  ["storage_bytes", t.storageGB, GB],
                  ["active_events", t.events, 1],
                  ["searches", t.searches, 1],
                  ["delivery_bytes", t.deliveryGB, GB],
                  ["trial_days", t.trialDays, 1],
                ] as const
              ).map(([k, label, scale]) => (
                <label className="field" key={k}>
                  {label}
                  <input
                    type="number"
                    required
                    step={scale === GB ? "0.001" : "1"}
                    min={k === "trial_days" ? 0 : 1}
                    disabled={k === "trial_days" && plan.code !== "trial"}
                    value={plan[k] / scale}
                    onChange={(e) =>
                      update(index, {
                        [k]: Math.round(Number(e.target.value) * scale),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="field">
              {t.benefits}
              <textarea
                value={plan.features.join("\n")}
                onChange={(e) =>
                  update(index, {
                    features: e.target.value.split("\n").filter(Boolean),
                  })
                }
              />
            </label>
            <div className="billing-form-grid">
              <label className="check-row">
                <input
                  type="checkbox"
                  disabled={plan.code === "trial"}
                  checked={plan.visible}
                  onChange={(e) => update(index, { visible: e.target.checked })}
                />
                {t.showPlan}
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={plan.featured}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      plans: v.plans.map((p, i) => ({
                        ...p,
                        featured: i === index ? e.target.checked : false,
                      })),
                    }))
                  }
                />
                {t.recommended}
              </label>
            </div>
          </section>
        ))}
        <div className="admin-card billing-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={value.plans.length >= 10}
            onClick={() =>
              setValue((v) => ({
                ...v,
                plans: [
                  ...v.plans,
                  {
                    ...v.plans.find((p) => p.code !== "trial")!,
                    code: `plan_${Date.now()}`,
                    name: t.newPlan,
                    visible: false,
                    featured: false,
                  },
                ],
              }))
            }
          >
            {t.addPlan}
          </button>
          <SubmitButton label={a.save} pending={messages[locale].saving} />
        </div>
      </form>
      <section className="admin-card">
        <h2>{t.publishTitle}</h2>
        <p>{t.publishHelp}</p>
        <form action={action}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="operation" value="publish" />
          <SubmitButton label={a.publish} pending={messages[locale].saving} />
        </form>
      </section>
      <section className="admin-card">
        <h2>{t.history}</h2>
        <form action={action} className="billing-actions">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="operation" value="restore" />
          <select name="restore" aria-label={t.history}>
            {history.map((r) => (
              <option key={r.revision} value={r.revision}>
                {t.revision} {r.revision} ·{" "}
                {r.published ? t.published : t.draft}
              </option>
            ))}
          </select>
          <SubmitButton label={t.restore} pending={messages[locale].saving} />
        </form>
      </section>
      <section className="admin-card pricing-preview">
        <h2>{t.preview}</h2>
        <div className="crafted-landing">
          <PricingSection pricing={value} locale={locale} />
        </div>
      </section>
    </>
  );
}
