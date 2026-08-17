"use client";

import React from "react";

import type {
  FlowDocument,
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

import UpdateContactStepEditor from
  "@/components/MagicTouch/Flows/steps/UpdateContactStepEditor";

import TimelineStepEditor from
  "@/components/MagicTouch/Flows/steps/TimelineStepEditor";

import SurenseActivityStepEditor from
  "@/components/MagicTouch/Flows/steps/SurenseActivityStepEditor";

import {
  getStepVisual,
} from "@/components/MagicTouch/Flows/StepSummary";

import SendWhatsAppStepEditor from
  "@/components/MagicTouch/Flows/steps/SendWhatsAppStepEditor";

type Props = {
  flow: FlowDocument;
  stepId: string;
  step: FlowStep;
  onUpdateStep: (
    stepId: string,
    patch: Partial<FlowStep>
  ) => void;
  onUpdateConfig: (
    stepId: string,
    patch: Record<string, unknown>
  ) => void;
  onClose: () => void;
};

export default function FlowStepEditorPanel({
  flow,
  stepId,
  step,
  onUpdateStep,
  onUpdateConfig,
  onClose,
}: Props) {
  const visual = getStepVisual(step.type);
  const stepIds = Object.keys(flow.steps);

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
            {visual.icon}
          </span>

          <div>
            <div className="text-xs font-semibold text-blue-700">
              עריכת שלב · {visual.label}
            </div>

            <h3 className="mt-1 text-lg font-bold text-slate-900">
              {step.name || stepId}
            </h3>

            <div className="mt-1 text-xs text-slate-500">
              {stepId}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          סגירת העריכה
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-medium">
            שם השלב
          </span>

          <input
            className="w-full rounded-lg border bg-white px-3 py-2"
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
            <span className="mb-1 block text-sm font-medium">
              השלב הבא
            </span>

            <select
              className="w-full rounded-lg border bg-white px-3 py-2"
              value={step.nextStepId || ""}
              onChange={(event) =>
                onUpdateStep(stepId, {
                  nextStepId: event.target.value || null,
                })
              }
            >
              <option value="">
                ללא שלב הבא — סיום המסלול
              </option>

              {stepIds
                .filter((candidateStepId) => candidateStepId !== stepId)
                .map((candidateStepId) => (
                  <option
                    key={candidateStepId}
                    value={candidateStepId}
                  >
                    {flow.steps[candidateStepId].name || candidateStepId}
                  </option>
                ))}
            </select>

            <span className="mt-1 block text-xs text-slate-500">
              בחרי במפורש לאיזה שלב התהליך ימשיך.
            </span>
          </label>
        ) : null}

    {step.type === "send_whatsapp" ? (
  <div className="md:col-span-2">
    <SendWhatsAppStepEditor
      step={
        step
      }
      onConfigChange={(
        patch
      ) =>
        onUpdateConfig(
          stepId,
          patch
        )
      }
    />
  </div>
) : null}

        {step.type === "update_contact" ? (
          <UpdateContactStepEditor
            step={step}
            onConfigChange={(patch) =>
              onUpdateConfig(stepId, patch)
            }
          />
        ) : null}

        {step.type === "add_timeline_event" ? (
          <TimelineStepEditor
            step={step}
            onConfigChange={(patch) =>
              onUpdateConfig(stepId, patch)
            }
          />
        ) : null}

        {step.type === "sync_surense_activity" ? (
          <SurenseActivityStepEditor
            step={step}
            onConfigChange={(patch) =>
              onUpdateConfig(stepId, patch)
            }
          />
        ) : null}

        {step.type === "end" ? (
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium">
              הודעת סיום פנימית
            </span>

            <input
              className="w-full rounded-lg border bg-white px-3 py-2"
              value={String(step.config?.message || "")}
              onChange={(event) =>
                onUpdateConfig(stepId, {
                  message: event.target.value,
                })
              }
              placeholder="לדוגמה: Flow completed"
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}
