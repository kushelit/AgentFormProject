"use client";

import React from "react";

import type {
  MagicTouchFlowRun,
} from "@/lib/MagicTouch/runs/types";

import {
  formatDateTime,
  statusLabel,
  stepIcon,
} from "./monitorHelpers";

type Props = {
  run: MagicTouchFlowRun;
};

export default function MonitorLiveConsole({
  run,
}: Props) {
  const rows = [
    {
      time:
        run.processingStartedAt ||
        run.createdAt,
      icon:
        "▶️",
      title:
        "ההרצה התחילה",
      status:
        run.status,
    },
    ...run.stepHistory.map(
      (
        step
      ) => ({
        time:
          step.completedAt ||
          step.startedAt,
        icon:
          stepIcon(
            step.stepType
          ),
        title:
          step.stepName ||
          step.stepId,
        status:
          step.status,
      })
    ),
  ];

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">
            Live Console
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            תצוגת יומן מקוצרת לפי סדר הביצוע.
          </p>
        </div>

        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
      </div>

      <div className="mt-5 space-y-3 font-mono text-xs">
        {rows.map(
          (
            row,
            index
          ) => (
            <div
              key={`${row.title}_${index}`}
              className="grid grid-cols-[90px_28px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
            >
              <span className="text-slate-500">
                {
                  row.time
                    ? new Intl.DateTimeFormat(
                      "he-IL",
                      {
                        hour:
                          "2-digit",
                        minute:
                          "2-digit",
                        second:
                          "2-digit",
                      }
                    ).format(
                      new Date(
                        row.time
                      )
                    )
                    : "—"
                }
              </span>

              <span>
                {
                  row.icon
                }
              </span>

              <span className="truncate">
                {
                  row.title
                }
              </span>

              <span className="text-slate-400">
                {
                  statusLabel(
                    row.status
                  )
                }
              </span>
            </div>
          )
        )}
      </div>
    </section>
  );
}
