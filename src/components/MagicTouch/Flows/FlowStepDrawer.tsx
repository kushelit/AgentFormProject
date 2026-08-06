"use client";

import React, { useEffect } from "react";
import type { FlowStep } from "@/lib/MagicTouch/flows/types";
import UpdateContactStepEditor from
  "@/components/MagicTouch/Flows/steps/UpdateContactStepEditor";
import TimelineStepEditor from
  "@/components/MagicTouch/Flows/steps/TimelineStepEditor";
import SurenseActivityStepEditor from
  "@/components/MagicTouch/Flows/steps/SurenseActivityStepEditor";
import CreateSurensePowerOfAttorneyStepEditor from
  "@/components/MagicTouch/Flows/steps/CreateSurensePowerOfAttorneyStepEditor";
import RequestDocumentsStepEditor from
  "@/components/MagicTouch/Flows/steps/RequestDocumentsStepEditor";
import {
  getStepIcon,
  getStepTypeLabel,
} from "./FlowStepSummary";



type Props = {
  open: boolean;
  step: FlowStep | null;
  stepIds: string[];
  steps: Record<string, FlowStep>;
  onClose: () => void;
  onUpdateStep: (stepId: string, patch: Partial<FlowStep>) => void;
  onUpdateConfig: (stepId: string, patch: Record<string, unknown>) => void;
};

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

export default function FlowStepDrawer({
  open,
  step,
  stepIds,
  steps,
  onClose,
  onUpdateStep,
  onUpdateConfig,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [open, onClose]);

  if (!open || !step) return null;

  const stepId = step.id;

  return (
    <div className="fixed inset-0 z-[60]" dir="rtl">
      <button
        type="button"
        aria-label="סגירת עורך השלב"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside className="absolute inset-y-0 left-0 flex w-full max-w-3xl flex-col bg-slate-50 shadow-2xl">
        <header className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-xl">
                {getStepIcon(step)}
              </div>

              <div>
                <div className="text-xs font-semibold text-blue-600">
                  {getStepTypeLabel(step)}
                </div>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  {step.name || "עריכת שלב"}
                </h2>
                <p className="mt-1 text-xs text-slate-400" dir="ltr">
                  {step.id}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 hover:bg-slate-50"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-bold text-slate-900">
                פרטי השלב
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    שם השלב
                  </span>
                  <input
                    className={fieldClass}
                    value={step.name}
                    onChange={(event) =>
                      onUpdateStep(stepId, {
                        name: event.target.value,
                      })
                    }
                  />
                </label>

                {step.type !== "end" ? (
                  <label>
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      השלב הבא
                    </span>
                    <select
                      className={fieldClass}
                      value={step.nextStepId || ""}
                      onChange={(event) =>
                        onUpdateStep(stepId, {
                          nextStepId: event.target.value || null,
                        })
                      }
                    >
                      <option value="">ללא שלב הבא</option>
                      {stepIds
                        .filter((candidateId) => candidateId !== stepId)
                        .map((candidateId) => (
                          <option key={candidateId} value={candidateId}>
                            {steps[candidateId]?.name || candidateId}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-1 font-bold text-slate-900">
                הגדרות הפעולה
              </h3>
              <p className="mb-5 text-sm text-slate-500">
                הגדירי מה יקרה כאשר המערכת תגיע לשלב הזה.
              </p>

              {step.type === "send_whatsapp" ? (
                <label>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    תוכן ההודעה
                  </span>
                  <textarea
                    className="min-h-44 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                    value={String(step.config?.message || "")}
                    onChange={(event) =>
                      onUpdateConfig(stepId, {
                        mode: "text",
                        message: event.target.value,
                      })
                    }
                    placeholder="כתבי את ההודעה שתישלח ללקוח..."
                  />
                </label>
              ) : null}

              {step.type === "update_contact" ? (
                <UpdateContactStepEditor
                  step={step}
                  onConfigChange={(patch) => onUpdateConfig(stepId, patch)}
                />
              ) : null}

              {step.type === "add_timeline_event" ? (
                <TimelineStepEditor
                  step={step}
                  onConfigChange={(patch) => onUpdateConfig(stepId, patch)}
                />
              ) : null}

              {step.type === "sync_surense_activity" ? (
                <SurenseActivityStepEditor
                  step={step}
                  onConfigChange={(patch) => onUpdateConfig(stepId, patch)}
                />
              ) : null}

              {step.type === "request_documents" ? (
                <RequestDocumentsStepEditor
                  step={step}
                  onConfigChange={(patch) => onUpdateConfig(stepId, patch)}
                />
              ) : null}

              {step.type === "create_surense_power_of_attorney" ? (
                <CreateSurensePowerOfAttorneyStepEditor
                  step={step}
                  onConfigChange={(
                    patch: Record<string, unknown>
                  ) => onUpdateConfig(stepId, patch)}
                />
              ) : null}

              {step.type === "end" ? (
                <label>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    הודעת סיום פנימית
                  </span>
                  <input
                    className={fieldClass}
                    value={String(step.config?.message || "")}
                    onChange={(event) =>
                      onUpdateConfig(stepId, {
                        message: event.target.value,
                      })
                    }
                  />
                </label>
              ) : null}
            </section>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            סגירה
          </button>
          <button
            type="button"
            className="rounded-xl bg-blue-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-700"
            onClick={onClose}
          >
            סיום עריכה
          </button>
        </footer>
      </aside>
    </div>
  );
}
