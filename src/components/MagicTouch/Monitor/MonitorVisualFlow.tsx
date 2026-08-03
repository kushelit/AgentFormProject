"use client";

import React from "react";

import type {
  MagicTouchFlowRun,
} from "@/lib/MagicTouch/runs/types";

import {
  statusClass,
  statusLabel,
  stepIcon,
} from "./monitorHelpers";

type Props = {
  run: MagicTouchFlowRun;
};

export default function MonitorVisualFlow({
  run,
}: Props) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-bold text-slate-900">
          מסלול ההרצה
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          שלבים שהסתיימו, השלב הנוכחי ושגיאות.
        </p>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <Node
          icon="⚡"
          title="טריגר"
          status="completed"
        />

        {run.stepHistory.map(
          (
            step,
            index
          ) => (
            <React.Fragment
              key={`${step.stepId}_${index}`}
            >
              <Connector />

              <Node
                icon={
                  stepIcon(
                    step.stepType
                  )
                }
                title={
                  step.stepName ||
                  step.stepId
                }
                status={
                  step.status
                }
              />
            </React.Fragment>
          )
        )}
      </div>
    </section>
  );
}

function Connector() {
  return (
    <div className="flex h-14 flex-col items-center">
      <div className="h-12 w-px bg-slate-300" />
      <div className="-mt-1 text-xs text-slate-400">
        ▼
      </div>
    </div>
  );
}

function Node({
  icon,
  title,
  status,
}: {
  icon:
    string;
  title:
    string;
  status:
    string;
}) {
  return (
    <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xl">
          {
            icon
          }
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-slate-900">
            {
              title
            }
          </div>
        </div>

        <span
          className={[
            "rounded-full border px-2.5 py-1 text-xs font-bold",
            statusClass(
              status
            ),
          ].join(
            " "
          )}
        >
          {
            statusLabel(
              status
            )
          }
        </span>
      </div>
    </div>
  );
}
