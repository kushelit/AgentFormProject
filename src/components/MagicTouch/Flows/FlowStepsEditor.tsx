"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FlowDocument,
  FlowStep,
  StepType,
} from "@/lib/MagicTouch/flows/types";

import FlowNode from "./FlowNode";
import FlowConnector from "./FlowConnector";
import FlowStepDrawer from "./FlowStepDrawer";
import { STEP_TYPES } from "./FlowStepCatalog";

type Props = {
  value: FlowDocument;
  onChange: (value: FlowDocument) => void;
};

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
            "engagement.reengagement.lastFlowRunId": "{{run.runId}}",
            "engagement.reengagement.updatedAt": "{{nowTimestamp}}",
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

    case "create_surense_power_of_attorney":
      return {
        id,
        type,
        name: "יצירת קישור ייפוי כוח",
        nextStepId: null,
        config: {
          includeHb: true,
          includePolicies: true,
          includeSwiftness: true,
          statusPath:
            "engagement.reengagement.powerOfAttorney",
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

function buildOrderedStepIds(value: FlowDocument): string[] {
  const steps = value.steps;
  const allIds = Object.keys(steps);

  if (allIds.length === 0) return [];

  const ordered: string[] = [];
  const visited = new Set<string>();
  let currentId = value.firstStepId || allIds[0];

  while (currentId && steps[currentId] && !visited.has(currentId)) {
    ordered.push(currentId);
    visited.add(currentId);
    currentId = String(steps[currentId].nextStepId || "").trim();
  }

  for (const id of allIds) {
    if (!visited.has(id)) ordered.push(id);
  }

  return ordered;
}

function triggerLabel(type: string): string {
  switch (type) {
    case "whatsapp_quick_reply_received":
      return "לחיצה על כפתור WhatsApp";
    case "whatsapp_message_received":
      return "התקבלה הודעת WhatsApp";
    case "microsoft_booking_created":
      return "נקבעה פגישה ב־Microsoft Bookings";
    case "microsoft_booking_cancelled":
      return "בוטלה פגישה ב־Microsoft Bookings";
    case "reengagement_message_sent":
      return "נשלחה הודעת חידוש קשר";
    case "manual":
      return "הפעלה ידנית";
    default:
      return type || "לא הוגדר טריגר";
  }
}

export default function FlowStepsEditor({
  value,
  onChange,
}: Props) {
  const steps = value.steps;

  const orderedStepIds = useMemo(
    () => buildOrderedStepIds(value),
    [value]
  );

  const [selectedStepId, setSelectedStepId] =
    useState<string | null>(null);

  useEffect(() => {
    if (selectedStepId && !steps[selectedStepId]) {
      setSelectedStepId(null);
    }
  }, [selectedStepId, steps]);

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

  const addStepAfter = (
    type: StepType,
    afterStepId: string | null
  ) => {
    const stepId = createStepId(type, steps);
    const newStep = createDefaultStep(stepId, type);
    const nextSteps: Record<string, FlowStep> = {
      ...steps,
    };

    if (!afterStepId) {
      const previousFirstStepId = value.firstStepId || null;

      nextSteps[stepId] = {
        ...newStep,
        ...(type !== "end"
          ? {
              nextStepId: previousFirstStepId,
            }
          : {}),
      };

      onChange({
        ...value,
        firstStepId: stepId,
        steps: nextSteps,
      });

      setSelectedStepId(stepId);
      return;
    }

    const previousStep = steps[afterStepId];
    const previousNextStepId = previousStep?.nextStepId || null;

    nextSteps[afterStepId] = {
      ...previousStep,
      nextStepId: stepId,
    };

    nextSteps[stepId] = {
      ...newStep,
      ...(type !== "end"
        ? {
            nextStepId: previousNextStepId,
          }
        : {}),
    };

    onChange({
      ...value,
      firstStepId: value.firstStepId || stepId,
      steps: nextSteps,
    });

    setSelectedStepId(stepId);
  };

  const removeStep = (stepIdToRemove: string) => {
    const approved = window.confirm(
      "למחוק את השלב? החיבור יעבור לשלב שאחריו ככל שניתן."
    );

    if (!approved) return;

    const removedStep = steps[stepIdToRemove];
    const replacementStepId = removedStep?.nextStepId || null;
    const nextSteps: Record<string, FlowStep> = {};

    for (const [stepId, step] of Object.entries(steps)) {
      if (stepId === stepIdToRemove) continue;

      nextSteps[stepId] = {
        ...step,
        nextStepId:
          step.nextStepId === stepIdToRemove
            ? replacementStepId
            : step.nextStepId,
        config: {
          ...step.config,
          trueStepId:
            step.config?.trueStepId === stepIdToRemove
              ? replacementStepId || ""
              : step.config?.trueStepId,
          falseStepId:
            step.config?.falseStepId === stepIdToRemove
              ? replacementStepId || ""
              : step.config?.falseStepId,
        },
      };
    }

    const remainingIds = Object.keys(nextSteps);

    onChange({
      ...value,
      firstStepId:
        value.firstStepId === stepIdToRemove
          ? replacementStepId || remainingIds[0] || ""
          : value.firstStepId,
      steps: nextSteps,
    });

    if (selectedStepId === stepIdToRemove) {
      setSelectedStepId(null);
    }
  };

  const selectedStep = selectedStepId
    ? steps[selectedStepId] || null
    : null;

  const disconnectedCount = orderedStepIds.filter((stepId) => {
    const step = steps[stepId];
    return step.type !== "end" && !step.nextStepId;
  }).length;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">
              מסלול האוטומציה
            </h2>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {orderedStepIds.length} שלבים
            </span>

            {disconnectedCount === 0 && orderedStepIds.length > 0 ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                כל השלבים מחוברים
              </span>
            ) : disconnectedCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                {disconnectedCount} דורשים חיבור
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-slate-500">
            לחצי על כרטיס לעריכה. הוסיפי פעולה באמצעות כפתור הפלוס.
          </p>
        </div>
      </header>

      <div className="relative min-h-[480px] overflow-hidden px-5 py-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center">
          <div className="w-full max-w-lg rounded-3xl border border-blue-200 bg-white p-5 text-center shadow-sm">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-xl">
              ⚡
            </div>
            <div className="mt-3 text-xs font-bold text-blue-600">
              טריגר
            </div>
            <div className="mt-1 font-bold text-slate-900">
              {triggerLabel(String(value.trigger?.type || ""))}
            </div>
          </div>

          <FlowConnector
            options={STEP_TYPES}
            onAdd={(type) => addStepAfter(type, null)}
          />

          {orderedStepIds.length === 0 ? (
            <div className="w-full max-w-lg rounded-3xl border-2 border-dashed border-slate-300 bg-white/80 p-10 text-center">
              <div className="text-4xl">⚙️</div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                הוסיפי את הפעולה הראשונה
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                לחצי על הפלוס שמעל הכרטיס.
              </p>
            </div>
          ) : (
            orderedStepIds.map((stepId, index) => {
              const step = steps[stepId];
              const nextStepName = step.nextStepId
                ? steps[step.nextStepId]?.name || step.nextStepId
                : null;

              return (
                <React.Fragment key={stepId}>
                  <FlowNode
                    step={step}
                    stepNumber={index + 1}
                    nextStepName={nextStepName}
                    isFirst={value.firstStepId === stepId}
                    isSelected={selectedStepId === stepId}
                    isConnected={
                      step.type === "end" ||
                      Boolean(step.nextStepId)
                    }
                    onSelect={() => setSelectedStepId(stepId)}
                    onDelete={() => removeStep(stepId)}
                    onSetFirst={() =>
                      onChange({
                        ...value,
                        firstStepId: stepId,
                      })
                    }
                  />

                  {step.type !== "end" ? (
                    <FlowConnector
                      options={STEP_TYPES}
                      onAdd={(type) => addStepAfter(type, stepId)}
                    />
                  ) : null}
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

      <FlowStepDrawer
        open={Boolean(selectedStep)}
        step={selectedStep}
        stepIds={Object.keys(steps)}
        steps={steps}
        onClose={() => setSelectedStepId(null)}
        onUpdateStep={updateStep}
        onUpdateConfig={updateConfig}
      />
    </section>
  );
}
