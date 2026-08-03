"use client";

import React from "react";
import Link from "next/link";

import type {
  MagicTouchFlowRun,
} from "@/lib/MagicTouch/runs/types";

import {
  durationLabel,
  formatDateTime,
  statusClass,
  statusLabel,
  triggerIcon,
  triggerLabel,
  userFriendlyError,
} from "./monitorHelpers";

type Props = {
  run: MagicTouchFlowRun;
  agentId: string;
};

export default function MonitorRunCard({
  run,
  agentId,
}: Props) {
  const lastError =
    run.error ||
    run.stepHistory.find(
      (step) =>
        step.status === "failed" &&
        step.error
    )?.error ||
    null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold",
                statusClass(run.status),
              ].join(" ")}
            >
              {statusLabel(run.status)}
            </span>

            <span className="text-xs text-slate-400">
              {formatDateTime(
                run.processingStartedAt ||
                run.createdAt
              )}
            </span>
          </div>

          <h3 className="mt-3 text-lg font-bold text-slate-900">
            {run.flowName || run.flowId}
          </h3>

          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            <span>
              👤 {run.contactName || run.contactId || "ללא איש קשר"}
            </span>

            <span>
              {triggerIcon(run.triggerType)} {triggerLabel(run.triggerType)}
            </span>

            <span>
              ⏱️ {durationLabel(run)}
            </span>
          </div>
        </div>

        <Link
          href={`/MagicTouch/Runs/${encodeURIComponent(
            run.runId
          )}?agentId=${encodeURIComponent(agentId)}`}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          פתיחת הרצה
        </Link>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
        <div className="text-xs font-semibold text-slate-400">
          שלב נוכחי / אחרון
        </div>

        <div className="mt-1 font-semibold text-slate-700">
          {
            run.currentStepName ||
            run.lastStepName ||
            run.currentStepId ||
            run.lastStepId ||
            "טרם התחיל שלב"
          }
        </div>
      </div>

      {lastError ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-xs font-bold text-red-600">
            סיבת הכשל
          </div>

          <div className="mt-1 text-sm text-red-700">
            {userFriendlyError(lastError)}
          </div>
        </div>
      ) : null}
    </article>
  );
}
