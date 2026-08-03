"use client";

import React, {
  useMemo,
} from "react";

import type {
  MagicTouchFlowRun,
} from "@/lib/MagicTouch/runs/types";

import {
  durationMs,
} from "./monitorHelpers";

type Props = {
  runs: MagicTouchFlowRun[];
};

function dayKey(
  value: number
): string {
  const date =
    new Date(value);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function shortDate(
  value: string
): string {
  const date =
    new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat(
    "he-IL",
    {
      day: "2-digit",
      month: "2-digit",
    }
  ).format(date);
}

export default function MonitorPerformancePanel({
  runs,
}: Props) {
  const data =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            {
              total:
                number;
              success:
                number;
              failed:
                number;
              durations:
                number[];
            }
          >();

        for (
          const run of runs
        ) {
          const time =
            run.createdAt ||
            run.processingStartedAt;

          if (!time) continue;

          const key =
            dayKey(time);

          const entry =
            map.get(key) || {
              total: 0,
              success: 0,
              failed: 0,
              durations: [],
            };

          entry.total += 1;

          if (run.status === "completed") {
            entry.success += 1;
          }

          if (run.status === "failed") {
            entry.failed += 1;
          }

          const duration =
            durationMs(run);

          if (duration !== null) {
            entry.durations.push(duration);
          }

          map.set(key, entry);
        }

        return Array.from(
          map.entries()
        )
          .sort(
            (left, right) =>
              left[0].localeCompare(right[0])
          )
          .slice(-7);
      },
      [runs]
    );

  const maxTotal =
    Math.max(
      1,
      ...data.map(
        ([, item]) =>
          item.total
      )
    );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-bold text-slate-900">
          ביצועים ב־7 הימים האחרונים
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          נפח הרצות, הצלחות וכשלים לפי יום.
        </p>
      </div>

      {data.length === 0 ? (
        <div className="mt-6 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
          עדיין אין מספיק נתונים להצגה.
        </div>
      ) : (
        <div className="mt-6 flex h-56 items-end gap-3 overflow-x-auto pb-2">
          {data.map(
            ([
              key,
              item,
            ]) => {
              const height =
                Math.max(
                  14,
                  item.total /
                    maxTotal *
                    160
                );

              return (
                <div
                  key={key}
                  className="flex min-w-16 flex-1 flex-col items-center"
                >
                  <div className="mb-2 text-xs font-bold text-slate-700">
                    {item.total}
                  </div>

                  <div
                    className="w-full max-w-12 overflow-hidden rounded-t-xl bg-blue-100"
                    style={{
                      height:
                        `${height}px`,
                    }}
                    title={`${item.success} הצליחו, ${item.failed} נכשלו`}
                  >
                    <div
                      className="w-full bg-emerald-400"
                      style={{
                        height:
                          `${
                            item.total >
                            0
                              ? item.success /
                                item.total *
                                100
                              : 0
                          }%`,
                      }}
                    />
                  </div>

                  <div className="mt-2 text-xs text-slate-400">
                    {shortDate(key)}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </section>
  );
}
