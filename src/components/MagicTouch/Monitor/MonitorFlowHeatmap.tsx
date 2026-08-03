"use client";

import React, {
  useMemo,
} from "react";

import type {
  MagicTouchFlowRun,
} from "@/lib/MagicTouch/runs/types";

type Props = {
  runs: MagicTouchFlowRun[];
  onSelectFlow?: (
    flowId:
      string
  ) => void;
};

export default function MonitorFlowHeatmap({
  runs,
  onSelectFlow,
}: Props) {
  const rows =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            {
              flowId:
                string;
              flowName:
                string;
              total:
                number;
              completed:
                number;
              failed:
                number;
            }
          >();

        for (
          const run of runs
        ) {
          const key =
            run.flowId ||
            run.flowName ||
            "unknown";

          const current =
            map.get(key) || {
              flowId:
                run.flowId ||
                key,
              flowName:
                run.flowName ||
                run.flowId ||
                "ללא שם",
              total:
                0,
              completed:
                0,
              failed:
                0,
            };

          current.total += 1;

          if (
            run.status ===
            "completed"
          ) {
            current.completed += 1;
          }

          if (
            run.status ===
            "failed"
          ) {
            current.failed += 1;
          }

          map.set(key, current);
        }

        return Array.from(
          map.values()
        )
          .sort(
            (
              left,
              right
            ) =>
              right.total -
              left.total
          )
          .slice(
            0,
            8
          );
      },
      [runs]
    );

  const max =
    Math.max(
      1,
      ...rows.map(
        (row) =>
          row.total
      )
    );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-bold text-slate-900">
          האוטומציות הפעילות ביותר
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          נפח הרצות ושיעור הצלחה לפי Flow.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
            עדיין אין נתונים.
          </div>
        ) : (
          rows.map(
            (row) => {
              const successRate =
                row.total >
                0
                  ? Math.round(
                    row.completed /
                    row.total *
                    100
                  )
                  : 0;

              return (
                <button
                  key={
                    row.flowId
                  }
                  type="button"
                  className="block w-full rounded-xl p-2 text-right transition hover:bg-slate-50"
                  onClick={() =>
                    onSelectFlow?.(
                      row.flowId
                    )
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-800">
                        {
                          row.flowName
                        }
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        {
                          row.total
                        } הרצות · {
                          successRate
                        }% הצלחה
                      </div>
                    </div>

                    <div className="text-sm font-bold text-slate-700">
                      {
                        row.total
                      }
                    </div>
                  </div>

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{
                        width:
                          `${
                            row.total /
                            max *
                            100
                          }%`,
                      }}
                    />
                  </div>
                </button>
              );
            }
          )
        )}
      </div>
    </section>
  );
}
