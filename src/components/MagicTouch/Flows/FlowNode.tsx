"use client";

import React from "react";
import type { FlowStep } from "@/lib/MagicTouch/flows/types";
import {
  getStepAccent,
  getStepIcon,
  getStepSummary,
  getStepTypeLabel,
} from "./FlowStepSummary";

import {
  getSystemForStepType,
} from "@/lib/MagicTouch/flows/flowBuilderRegistry";

type Props = {
  step: FlowStep;
  stepNumber: number;
  nextStepName: string | null;
  isFirst: boolean;
  isSelected: boolean;
  isConnected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onSetFirst: () => void;
};

export default function FlowNode({
  step,
  stepNumber,
  nextStepName,
  isFirst,
  isSelected,
  isConnected,
  onSelect,
  onDelete,
  onSetFirst,
}: Props) {
  const accent = getStepAccent(step);
  const summary = getStepSummary(step);

  const stepSystem =
  getSystemForStepType(
    step.type
  );

const stepAction =
  stepSystem?.actions.find(
    (action) =>
      action.stepType ===
      step.type
  );

  return (
    <article
      className={[
        "group relative w-full max-w-lg overflow-hidden rounded-3xl border bg-white shadow-sm transition",
        accent.ring,
        isSelected
          ? "ring-4 ring-blue-100 shadow-xl"
          : "hover:-translate-y-0.5 hover:shadow-lg",
      ].join(" ")}
    >
      <button
        type="button"
        className="absolute inset-0 z-0"
        onClick={onSelect}
        aria-label={`עריכת ${step.name}`}
      />

      <div className="h-1.5 w-full bg-gradient-to-l from-transparent via-current to-transparent opacity-40" />

      <div className="relative z-10 p-5 pointer-events-none">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-xl shadow-sm ${accent.icon}`}
          >
            {getStepIcon(step)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400">
                שלב {stepNumber}
              </span>

             {stepSystem ? (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
    <span>
      {stepSystem.icon}
    </span>

    <span>
      {stepSystem.label}
    </span>
  </span>
) : null}

<span
  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${accent.badge}`}
>
  {stepAction?.label ||
    getStepTypeLabel(step)}
</span>
              {isFirst ? (
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  ראשון
                </span>
              ) : null}
            </div>

            <h3 className="mt-2 text-lg font-bold text-slate-900">
              {step.name || getStepTypeLabel(step)}
            </h3>

            <div className="mt-3 grid gap-2">
              {summary.slice(0, 3).map((line, index) => (
                <div
                  key={`${line}_${index}`}
                  className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"
                >
                  <span className="mt-0.5 text-blue-400">•</span>
                  <span className="line-clamp-2">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs">
          <span className="text-slate-500">
            {step.type === "end"
              ? "סיום המסלול"
              : nextStepName
                ? `ממשיך אל: ${nextStepName}`
                : "לא הוגדר שלב הבא"}
          </span>

          <span className={isConnected ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>
            {isConnected ? "✓ מחובר" : "⚠ דורש חיבור"}
          </span>
        </div>
      </div>

      <div className="relative z-20 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
        {!isFirst ? (
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            onClick={(event) => {
              event.stopPropagation();
              onSetFirst();
            }}
          >
            הגדר כראשון
          </button>
        ) : null}

        <button
          type="button"
          className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          עריכה
        </button>

        <button
          type="button"
          className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          מחיקה
        </button>
      </div>
    </article>
  );
}
