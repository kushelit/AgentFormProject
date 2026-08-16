"use client";

import React from "react";

import type {
  FlowDocument,
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

import {
  getStepConnectionLabel,
  getStepSummaryLines,
  getStepVisual,
  getStepWarnings,
} from "@/components/MagicTouch/Flows/StepSummary";

import {
  getSystemForStepType,
} from "@/lib/MagicTouch/flows/flowBuilderRegistry";


type Props = {
  flow: FlowDocument;
  stepId: string;
  step: FlowStep;
  index: number;
  isSelected: boolean;
  isFirst: boolean;
  onSelect: () => void;
  onSetFirst: () => void;
  onRemove: () => void;
};

export default function FlowStepCard({
  flow,
  stepId,
  step,
  index,
  isSelected,
  isFirst,
  onSelect,
  onSetFirst,
  onRemove,
}: Props) {
  const visual = getStepVisual(step.type);
  const summaryLines = getStepSummaryLines(step);
  const warnings = getStepWarnings(flow, stepId, step);
  const nextStepLabel = getStepConnectionLabel(flow, step);


  const stepSystem =
  getSystemForStepType(
    step.type
  );

const stepAction =
  stepSystem?.actions.find(
    (action) =>
      action.stepType === step.type
  );

  return (
    <article
      className={[
        "rounded-2xl border bg-white p-4 transition",
        visual.cardClassName,
        isSelected
          ? "ring-2 ring-blue-500 ring-offset-2"
          : "hover:border-slate-300 hover:shadow-sm",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-start gap-3 text-right"
        >
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl">
            {visual.icon}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                שלב {index + 1}
              </span>

              {isFirst ? (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                  שלב ראשון
                </span>
              ) : null}

           {stepSystem ? (
  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
    <span>{stepSystem.icon}</span>
    <span>{stepSystem.label}</span>
  </span>
) : null}

<span
  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${visual.badgeClassName}`}
>
  {stepAction?.label || visual.label}
</span>
            </span>

            <span className="mt-2 block truncate text-base font-bold text-slate-900">
              {step.name || "שלב ללא שם"}
            </span>

            <span className="mt-2 block space-y-1">
              {summaryLines.map((line, lineIndex) => (
                <span
                  key={`${stepId}_summary_${lineIndex}`}
                  className="block truncate text-sm text-slate-600"
                >
                  {lineIndex === 0 ? "" : "• "}
                  {line}
                </span>
              ))}
            </span>
          </span>
        </button>

        <div className="flex flex-shrink-0 flex-col gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {isSelected ? "סגור עריכה" : "ערוך"}
          </button>

          {!isFirst ? (
            <button
              type="button"
              onClick={onSetFirst}
              className="rounded-lg border px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
            >
              קבע כראשון
            </button>
          ) : null}

          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            מחיקה
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
        <span className="text-slate-500">מזהה: {stepId}</span>

        <span
          className={
            warnings.length > 0
              ? "font-semibold text-amber-700"
              : "font-semibold text-slate-700"
          }
        >
          {step.type === "end" ? "🏁 " : "➡ "}
          {nextStepLabel}
        </span>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          {warnings.map((warning) => (
            <div key={warning} className="text-xs font-medium text-amber-800">
              ⚠️ {warning}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-xs font-medium text-emerald-700">
          ✓ השלב מוגדר ומחובר
        </div>
      )}
    </article>
  );
}
