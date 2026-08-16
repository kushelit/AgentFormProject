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
    flowId: string
  ) => void;
};

type FlowPerformanceRow = {
  flowId: string;
  flowName: string;

  total: number;
  completed: number;
  failed: number;
  waiting: number;
  processing: number;

  successRate: number;
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
            Omit<
              FlowPerformanceRow,
              "successRate"
            >
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

              waiting:
                0,

              processing:
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

          if (
            run.status ===
            "waiting"
          ) {
            current.waiting += 1;
          }

          if (
            run.status ===
              "processing" ||
            run.status ===
              "pending" ||
            run.status ===
              "queued"
          ) {
            current.processing += 1;
          }

          map.set(
            key,
            current
          );
        }

        return Array.from(
          map.values()
        )
          .map(
            (
              row
            ): FlowPerformanceRow => {
              const finished =
                row.completed +
                row.failed;

              const successRate =
                finished > 0
                  ? Math.round(
                      row.completed /
                        finished *
                        100
                    )
                  : 0;

              return {
                ...row,
                successRate,
              };
            }
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
            10
          );
      },
      [
        runs,
      ]
    );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">
            ביצועים לפי אוטומציה
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            נפח הרצות, הצלחות, כשלים והרצות שעדיין פעילות.
          </p>
        </div>

        <div className="text-xs text-slate-400">
          לחיצה על אוטומציה תסנן את ההרצות
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
          עדיין אין נתוני הרצות להצגה.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 text-right font-semibold">
                  אוטומציה
                </th>

                <th className="px-3 py-3 text-center font-semibold">
                  הרצות
                </th>

                <th className="px-3 py-3 text-center font-semibold">
                  הושלמו
                </th>

                <th className="px-3 py-3 text-center font-semibold">
                  נכשלו
                </th>

                <th className="px-3 py-3 text-center font-semibold">
                  ממתינות
                </th>

                <th className="px-3 py-3 text-center font-semibold">
                  בתהליך
                </th>

                <th className="px-3 py-3 text-center font-semibold">
                  הצלחה
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows.map(
                (
                  row
                ) => (
                  <tr
                    key={
                      row.flowId
                    }
                    className="cursor-pointer transition hover:bg-blue-50/50"
                    onClick={() =>
                      onSelectFlow?.(
                        row.flowId
                      )
                    }
                  >
                    <td className="px-3 py-4">
                      <div className="font-bold text-slate-900">
                        {
                          row.flowName
                        }
                      </div>

                      <div
                        className="mt-1 max-w-52 truncate text-xs text-slate-400"
                        dir="ltr"
                        title={
                          row.flowId
                        }
                      >
                        {
                          row.flowId
                        }
                      </div>
                    </td>

                    <td className="px-3 py-4 text-center">
                      <MetricValue
                        value={
                          row.total
                        }
                      />
                    </td>

                    <td className="px-3 py-4 text-center">
                      <StatusCount
                        value={
                          row.completed
                        }
                        type="completed"
                      />
                    </td>

                    <td className="px-3 py-4 text-center">
                      <StatusCount
                        value={
                          row.failed
                        }
                        type="failed"
                      />
                    </td>

                    <td className="px-3 py-4 text-center">
                      <StatusCount
                        value={
                          row.waiting
                        }
                        type="waiting"
                      />
                    </td>

                    <td className="px-3 py-4 text-center">
                      <StatusCount
                        value={
                          row.processing
                        }
                        type="processing"
                      />
                    </td>

                    <td className="px-3 py-4">
                      <div className="flex min-w-28 items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={[
                              "h-full rounded-full",
                              successRateClass(
                                row.successRate
                              ),
                            ].join(
                              " "
                            )}
                            style={{
                              width:
                                `${row.successRate}%`,
                            }}
                          />
                        </div>

                        <span
                          className={[
                            "min-w-10 text-left text-sm font-bold",
                            successRateTextClass(
                              row.successRate
                            ),
                          ].join(
                            " "
                          )}
                        >
                          {
                            row.successRate
                          }%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MetricValue({
  value,
}: {
  value: number;
}) {
  return (
    <span className="font-bold text-slate-800">
      {value}
    </span>
  );
}

function StatusCount({
  value,
  type,
}: {
  value: number;
  type:
    | "completed"
    | "failed"
    | "waiting"
    | "processing";
}) {
  const className =
    type === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : type === "failed"
        ? "bg-red-50 text-red-700"
        : type === "waiting"
          ? "bg-amber-50 text-amber-700"
          : "bg-blue-50 text-blue-700";

  return (
    <span
      className={[
        "inline-flex min-w-9 items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold",
        className,
      ].join(
        " "
      )}
    >
      {value}
    </span>
  );
}

function successRateClass(
  value: number
): string {
  if (
    value >= 95
  ) {
    return "bg-emerald-500";
  }

  if (
    value >= 80
  ) {
    return "bg-blue-500";
  }

  if (
    value >= 60
  ) {
    return "bg-amber-500";
  }

  return "bg-red-500";
}

function successRateTextClass(
  value: number
): string {
  if (
    value >= 95
  ) {
    return "text-emerald-700";
  }

  if (
    value >= 80
  ) {
    return "text-blue-700";
  }

  if (
    value >= 60
  ) {
    return "text-amber-700";
  }

  return "text-red-700";
}