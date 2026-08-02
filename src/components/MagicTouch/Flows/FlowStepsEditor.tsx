"use client";

import React from "react";

import type {
  FlowDocument,
  FlowStep,
  StepType,
} from "@/lib/MagicTouch/flows/types";

import UpdateContactStepEditor from
  "@/components/MagicTouch/Flows/steps/UpdateContactStepEditor";

import TimelineStepEditor from
  "@/components/MagicTouch/Flows/steps/TimelineStepEditor";

import SurenseActivityStepEditor from
  "@/components/MagicTouch/Flows/steps/SurenseActivityStepEditor";

type Props = {
  value: FlowDocument;
  onChange: (value: FlowDocument) => void;
};

const STEP_TYPES: Array<{
  value: StepType;
  label: string;
}> = [
  {
    value: "send_whatsapp",
    label: "שליחת WhatsApp",
  },
  {
    value: "update_contact",
    label: "עדכון איש קשר",
  },
  {
    value: "add_timeline_event",
    label: "הוספה לציר הזמן",
  },
  {
    value: "sync_surense_activity",
    label: "עדכון פעילות בשורנס",
  },
  {
    value: "end",
    label: "סיום",
  },
];

function createStepId(
  type: StepType,
  existing: Record<string, FlowStep>
): string {
  let index = 1;
  let id = `${type}_${index}`;

  while (existing[id]) {
    index += 1;
    id = `${type}_${index}`;
  }

  return id;
}

function createDefaultStep(
  id: string,
  type: StepType
): FlowStep {
  switch (type) {
    case "send_whatsapp":
      return {
        id,
        type,
        name: "שליחת הודעת WhatsApp",
        nextStepId: null,
        config: {
          mode: "text",
          message: "",
        },
      };

    case "update_contact":
      return {
        id,
        type,
        name: "עדכון איש קשר",
        nextStepId: null,
        config: {
          updates: {
            "engagement.reengagement.lastFlowRunId":
              "{{run.runId}}",
            "engagement.reengagement.updatedAt":
              "{{nowTimestamp}}",
          },
        },
      };

    case "add_timeline_event":
      return {
        id,
        type,
        name: "הוספה לציר הזמן",
        nextStepId: null,
        config: {
          eventType: "magic_touch_flow_action",
          title: "",
          description: "",
        },
      };

    case "sync_surense_activity":
      return {
        id,
        type,
        name: "עדכון פעילות בשורנס",
        nextStepId: null,
        config: {
          activityType: "",
          workflowStatus: "closed",
          note: "",
        },
      };

    case "end":
      return {
        id,
        type,
        name: "סיום",
        config: {
          message: "",
        },
      };

    default:
      return {
        id,
        type,
        name: "שלב חדש",
        nextStepId: null,
        config: {},
      };
  }
}

export default function FlowStepsEditor({
  value,
  onChange,
}: Props) {
  const steps = value.steps;
  const stepIds = Object.keys(steps);

  const updateStep = (
    stepId: string,
    patch: Partial<FlowStep>
  ) => {
    onChange({
      ...value,
      steps: {
        ...steps,
        [stepId]: {
          ...steps[stepId],
          ...patch,
        },
      },
    });
  };

  const updateConfig = (
    stepId: string,
    patch: Record<string, unknown>
  ) => {
    updateStep(stepId, {
      config: {
        ...steps[stepId].config,
        ...patch,
      },
    });
  };

  const addStep = (
    type: StepType
  ) => {
    const stepId =
      createStepId(type, steps);

    const newStep =
      createDefaultStep(stepId, type);

    onChange({
      ...value,
      firstStepId:
        value.firstStepId || stepId,
      steps: {
        ...steps,
        [stepId]: newStep,
      },
    });
  };

  const removeStep = (
    stepIdToRemove: string
  ) => {
    const nextSteps:
      Record<string, FlowStep> = {};

    for (const [stepId, step]
      of Object.entries(steps)) {
      if (stepId === stepIdToRemove) {
        continue;
      }

      nextSteps[stepId] = {
        ...step,
        nextStepId:
          step.nextStepId === stepIdToRemove
            ? null
            : step.nextStepId,
        config: {
          ...step.config,
          trueStepId:
            step.config?.trueStepId === stepIdToRemove
              ? ""
              : step.config?.trueStepId,
          falseStepId:
            step.config?.falseStepId === stepIdToRemove
              ? ""
              : step.config?.falseStepId,
        },
      };
    }

    onChange({
      ...value,
      firstStepId:
        value.firstStepId === stepIdToRemove
          ? Object.keys(nextSteps)[0] || ""
          : value.firstStepId,
      steps: nextSteps,
    });
  };

  const renderNextStepEditor = (
    stepId: string,
    step: FlowStep
  ) => (
    <label>
      <span className="mb-1 block text-sm font-medium">
        השלב הבא
      </span>

      <select
        className="w-full rounded-lg border px-3 py-2"
        value={step.nextStepId || ""}
        onChange={(event) =>
          updateStep(stepId, {
            nextStepId:
              event.target.value || null,
          })
        }
      >
        <option value="">
          ללא שלב הבא — סיום המסלול
        </option>

        {stepIds
          .filter((candidateStepId) =>
            candidateStepId !== stepId
          )
          .map((candidateStepId) => (
            <option
              key={candidateStepId}
              value={candidateStepId}
            >
              {steps[candidateStepId].name ||
                candidateStepId}
            </option>
          ))}
      </select>
    </label>
  );

  return (
    <section className="rounded-xl border bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            שלבי התהליך
          </h2>

          <p className="text-sm text-gray-500">
            ניתן להוסיף את כל השלבים לפני השמירה, ולאחר מכן לחבר ביניהם.
          </p>
        </div>

        <select
          className="rounded-lg border px-3 py-2"
          defaultValue=""
          onChange={(event) => {
            const type =
              event.target.value as StepType;

            if (!type) {
              return;
            }

            addStep(type);
            event.target.value = "";
          }}
        >
          <option value="">
            הוסף שלב...
          </option>

          {STEP_TYPES.map((stepType) => (
            <option
              key={stepType.value}
              value={stepType.value}
            >
              {stepType.label}
            </option>
          ))}
        </select>
      </div>

      {stepIds.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          עדיין אין שלבים בתהליך.
        </div>
      ) : (
        <div className="space-y-4">
          {stepIds.map((stepId, index) => {
            const step = steps[stepId];

            const stepTypeLabel =
              STEP_TYPES.find(
                (item) =>
                  item.value === step.type
              )?.label || step.type;

            return (
              <article
                key={stepId}
                className="rounded-xl border p-4"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-gray-500">
                      שלב {index + 1} · {stepId}
                    </div>

                    <div className="font-semibold">
                      {stepTypeLabel}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="magicTouchFirstStep"
                        checked={
                          value.firstStepId === stepId
                        }
                        onChange={() =>
                          onChange({
                            ...value,
                            firstStepId: stepId,
                          })
                        }
                      />

                      שלב ראשון
                    </label>

                    <button
                      type="button"
                      className="rounded border px-3 py-1 text-sm text-red-600"
                      onClick={() =>
                        removeStep(stepId)
                      }
                    >
                      מחיקה
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-sm font-medium">
                      שם השלב
                    </span>

                    <input
                      className="w-full rounded-lg border px-3 py-2"
                      value={step.name}
                      onChange={(event) =>
                        updateStep(stepId, {
                          name: event.target.value,
                        })
                      }
                    />
                  </label>

                  {step.type !== "end" &&
                    renderNextStepEditor(
                      stepId,
                      step
                    )}

                  {step.type ===
                    "send_whatsapp" && (
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-sm font-medium">
                        תוכן ההודעה
                      </span>

                      <textarea
                        className="min-h-28 w-full rounded-lg border px-3 py-2"
                        value={String(
                          step.config?.message || ""
                        )}
                        onChange={(event) =>
                          updateConfig(stepId, {
                            mode: "text",
                            message:
                              event.target.value,
                          })
                        }
                      />
                    </label>
                  )}

                  {step.type ===
                    "update_contact" && (
                    <UpdateContactStepEditor
                      step={step}
                      onConfigChange={(patch) =>
                        updateConfig(stepId, patch)
                      }
                    />
                  )}

                  {step.type ===
                    "add_timeline_event" && (
                    <TimelineStepEditor
                      step={step}
                      onConfigChange={(patch) =>
                        updateConfig(stepId, patch)
                      }
                    />
                  )}

                  {step.type ===
                    "sync_surense_activity" && (
                    <SurenseActivityStepEditor
                      step={step}
                      onConfigChange={(patch) =>
                        updateConfig(stepId, patch)
                      }
                    />
                  )}

                  {step.type === "end" && (
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-sm font-medium">
                        הודעת סיום פנימית
                      </span>

                      <input
                        className="w-full rounded-lg border px-3 py-2"
                        value={String(
                          step.config?.message || ""
                        )}
                        onChange={(event) =>
                          updateConfig(stepId, {
                            message:
                              event.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
