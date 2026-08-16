"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import {
  getMagicTouchFlowRuns,
} from "@/lib/MagicTouch/runs/api";

import type {
  MagicTouchFlowRun,
} from "@/lib/MagicTouch/runs/types";

import MonitorFlowHeatmap from "@/components/MagicTouch/Monitor/MonitorFlowHeatmap";

import {
  formatDateTime,
  statusClass,
  statusLabel,
  triggerIcon,
  triggerLabel,
  userFriendlyError,
} from "@/components/MagicTouch/Monitor/monitorHelpers";

type Filters = {
  search: string;
  status: string;
  flowId: string;
  triggerType: string;
  dateFrom: string;
  dateTo: string;
};

const INITIAL_FILTERS: Filters = {
  search: "",
  status: "",
  flowId: "",
  triggerType: "",
  dateFrom: "",
  dateTo: "",
};

const AUTO_REFRESH_SECONDS = 15;

const INITIAL_VISIBLE_RUNS = 25;
const LOAD_MORE_COUNT = 25;

const fieldClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

export default function MagicTouchRunsPage() {
  const {
    selectedAgentId,
  } =
    useMagicTouchAgent();

  const [
    runs,
    setRuns,
  ] =
    useState<
      MagicTouchFlowRun[]
    >([]);

  const [
    filters,
    setFilters,
  ] =
    useState<Filters>(
      INITIAL_FILTERS
    );

  const [
    appliedFilters,
    setAppliedFilters,
  ] =
    useState<Filters>(
      INITIAL_FILTERS
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    autoRefresh,
    setAutoRefresh,
  ] =
    useState(false);

  const [
    lastLoadedAt,
    setLastLoadedAt,
  ] =
    useState<
      number | null
    >(null);

  const [
    visibleCount,
    setVisibleCount,
  ] =
    useState(
      INITIAL_VISIBLE_RUNS
    );

  const loadRuns =
    useCallback(
      async (
        silent = false
      ) => {
        if (
          !selectedAgentId
        ) {
          setRuns([]);
          setLoading(false);
          return;
        }

        if (!silent) {
          setLoading(true);
        }

        setError("");

        try {
          const response =
            await getMagicTouchFlowRuns({
              agentId:
                selectedAgentId,

              status:
                appliedFilters.status ||
                undefined,

              flowId:
                appliedFilters.flowId ||
                undefined,

              triggerType:
                appliedFilters.triggerType ||
                undefined,

              contactSearch:
                appliedFilters.search ||
                undefined,

              dateFrom:
                appliedFilters.dateFrom ||
                undefined,

              dateTo:
                appliedFilters.dateTo ||
                undefined,

              /*
               * כרגע אנחנו עדיין טוענים עד 300
               * לצורך ה-Analytics.
               *
               * בהמשך נפריד בין Aggregation
               * לבין Pagination של רשימת ההרצות.
               */
              limit:
                300,
            });

          setRuns(
            Array.isArray(
              response.runs
            )
              ? response.runs
              : []
          );

          setLastLoadedAt(
            Date.now()
          );
        } catch (
          loadError: any
        ) {
          console.error(
            "[MagicTouchRuns] load failed",
            loadError
          );

          setRuns([]);

          setError(
            loadError?.message ||
              "טעינת ההרצות נכשלה."
          );
        } finally {
          if (!silent) {
            setLoading(false);
          }
        }
      },
      [
        appliedFilters,
        selectedAgentId,
      ]
    );

  useEffect(
    () => {
      void loadRuns();
    },
    [
      loadRuns,
    ]
  );

  useEffect(
    () => {
      if (!autoRefresh) {
        return;
      }

      const timer =
        window.setInterval(
          () => {
            void loadRuns(
              true
            );
          },
          AUTO_REFRESH_SECONDS *
            1000
        );

      return () =>
        window.clearInterval(
          timer
        );
    },
    [
      autoRefresh,
      loadRuns,
    ]
  );

  const flowOptions =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            string
          >();

        for (
          const run of runs
        ) {
          if (!run.flowId) {
            continue;
          }

          map.set(
            run.flowId,
            run.flowName ||
              run.flowId
          );
        }

        return Array.from(
          map.entries()
        );
      },
      [
        runs,
      ]
    );

  const metrics =
    useMemo(
      () => {
        const completed =
          runs.filter(
            (run) =>
              run.status ===
              "completed"
          ).length;

        const failed =
          runs.filter(
            (run) =>
              run.status ===
              "failed"
          ).length;

        const waiting =
          runs.filter(
            (run) =>
              run.status ===
              "waiting"
          ).length;

        const processing =
          runs.filter(
            (run) =>
              run.status ===
                "processing" ||
              run.status ===
                "pending" ||
              run.status ===
                "queued"
          ).length;

        const finished =
          completed +
          failed;

        const successRate =
          finished > 0
            ? Math.round(
                completed /
                  finished *
                  100
              )
            : 0;

        return {
          completed,
          failed,
          waiting,
          processing,
          successRate,
        };
      },
      [
        runs,
      ]
    );

  const triggerBreakdown =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            number
          >();

        for (
          const run of runs
        ) {
          const key =
            run.triggerType ||
            "unknown";

          map.set(
            key,
            (
              map.get(key) ||
              0
            ) + 1
          );
        }

        return Array.from(
          map.entries()
        )
          .sort(
            (
              left,
              right
            ) =>
              right[1] -
              left[1]
          )
          .slice(
            0,
            6
          );
      },
      [
        runs,
      ]
    );

  const failedRuns =
    useMemo(
      () =>
        runs
          .filter(
            (run) =>
              run.status ===
              "failed"
          )
          .slice(
            0,
            5
          ),
      [
        runs,
      ]
    );

  const visibleRuns =
    useMemo(
      () =>
        runs.slice(
          0,
          visibleCount
        ),
      [
        runs,
        visibleCount,
      ]
    );

  const applyFilters = () => {
    setVisibleCount(
      INITIAL_VISIBLE_RUNS
    );

    setAppliedFilters(
      filters
    );
  };

  const clearFilters = () => {
    setVisibleCount(
      INITIAL_VISIBLE_RUNS
    );

    setFilters(
      INITIAL_FILTERS
    );

    setAppliedFilters(
      INITIAL_FILTERS
    );
  };

  const selectFlow = (
    flowId: string
  ) => {
    const next = {
      ...filters,
      flowId,
    };

    setVisibleCount(
      INITIAL_VISIBLE_RUNS
    );

    setFilters(
      next
    );

    setAppliedFilters(
      next
    );
  };

  const selectTrigger = (
    triggerType: string
  ) => {
    const next = {
      ...filters,
      triggerType,
    };

    setVisibleCount(
      INITIAL_VISIBLE_RUNS
    );

    setFilters(
      next
    );

    setAppliedFilters(
      next
    );
  };

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-blue-600">
              MagicTouch
            </div>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              בקרת אוטומציות
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              נתוני הרצות, ביצועים, כשלים ותחקור של
              תהליכי האוטומציה.
            </p>

            {lastLoadedAt ? (
              <p className="mt-2 text-xs text-slate-400">
                עודכן לאחרונה:{" "}
                {formatDateTime(
                  lastLoadedAt
                )}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm">
              <input
                type="checkbox"
                checked={
                  autoRefresh
                }
                onChange={(
                  event
                ) =>
                  setAutoRefresh(
                    event.target
                      .checked
                  )
                }
              />

              ניטור חי
            </label>

            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() =>
                void loadRuns()
              }
            >
              רענון
            </button>
          </div>
        </header>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        ) : null}

        {/* KPI */}
        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="סה״כ הרצות"
            value={String(
              runs.length
            )}
            icon="📊"
          />

          <MetricCard
            label="בתהליך"
            value={String(
              metrics.processing
            )}
            icon="▶️"
          />

          <MetricCard
            label="ממתינות"
            value={String(
              metrics.waiting
            )}
            icon="⏳"
          />

          <MetricCard
            label="הושלמו"
            value={String(
              metrics.completed
            )}
            icon="✅"
          />

          <MetricCard
            label="נכשלו"
            value={String(
              metrics.failed
            )}
            icon="❌"
          />

          <MetricCard
            label="אחוז הצלחה"
            value={`${metrics.successRate}%`}
            icon="🎯"
          />
        </section>

        {/* ביצועים לפי Flow */}
        <div className="mb-6">
          <MonitorFlowHeatmap
            runs={
              runs
            }
            onSelectFlow={
              selectFlow
            }
          />
        </div>

        {/* כשלים אחרונים */}
        {failedRuns.length > 0 ? (
          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-red-800">
                  כשלים אחרונים
                </h2>

                <p className="mt-1 text-sm text-red-600">
                  הרצות שכדאי לבדוק ולתחקר.
                </p>
              </div>

              <button
                type="button"
                className="text-sm font-bold text-red-700 hover:underline"
                onClick={() => {
                  const next = {
                    ...filters,
                    status:
                      "failed",
                  };

                  setFilters(
                    next
                  );

                  setAppliedFilters(
                    next
                  );

                  setVisibleCount(
                    INITIAL_VISIBLE_RUNS
                  );
                }}
              >
                הצגת כל הכשלים
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-red-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-red-50 text-red-700">
                  <tr>
                    <th className="px-4 py-3 text-right">
                      תאריך
                    </th>

                    <th className="px-4 py-3 text-right">
                      לקוח
                    </th>

                    <th className="px-4 py-3 text-right">
                      אוטומציה
                    </th>

                    <th className="px-4 py-3 text-right">
                      שלב
                    </th>

                    <th className="px-4 py-3 text-right">
                      שגיאה
                    </th>

                    <th className="px-4 py-3 text-right">
                      תחקור
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-red-100">
                  {failedRuns.map(
                    (run) => (
                      <tr
                        key={
                          run.runId
                        }
                        className="hover:bg-red-50/40"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatDateTime(
                            run.processingStartedAt ||
                              run.createdAt
                          )}
                        </td>

                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {run.contactName ||
                            run.contactId ||
                            "ללא איש קשר"}
                        </td>

                        <td className="px-4 py-3 text-slate-700">
                          {run.flowName ||
                            run.flowId ||
                            "-"}
                        </td>

                        <td className="px-4 py-3 text-slate-700">
                          {run.currentStepName ||
                            run.lastStepName ||
                            run.currentStepId ||
                            run.lastStepId ||
                            "-"}
                        </td>

                        <td className="max-w-xs px-4 py-3 text-red-700">
                          <span className="line-clamp-2">
                            {run.error
                              ? userFriendlyError(
                                  run.error
                                )
                              : "לא נשמר פירוט שגיאה"}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <RunDetailsLink
                            runId={
                              run.runId
                            }
                            agentId={
                              selectedAgentId ||
                              ""
                            }
                          />
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* מקורות הפעלה */}
        {triggerBreakdown.length > 0 ? (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="font-bold text-slate-900">
                מקורות הפעלה
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                כמה הרצות התחילו מכל סוג אירוע.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {triggerBreakdown.map(
                ([
                  triggerType,
                  count,
                ]) => (
                  <button
                    key={
                      triggerType
                    }
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right transition hover:border-blue-300 hover:bg-blue-50"
                    onClick={() =>
                      selectTrigger(
                        triggerType
                      )
                    }
                  >
                    <div className="text-xl">
                      {triggerIcon(
                        triggerType
                      )}
                    </div>

                    <div className="mt-2 text-sm font-bold text-slate-800">
                      {triggerLabel(
                        triggerType
                      )}
                    </div>

                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      {count}
                    </div>
                  </button>
                )
              )}
            </div>
          </section>
        ) : null}

        {/* Filters */}
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-bold text-slate-900">
              סינון ותחקור
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              מצאי הרצות לפי לקוח, סטטוס, אוטומציה
              וטווח תאריכים.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <label className="xl:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                חיפוש
              </span>

              <input
                className={
                  fieldClass
                }
                value={
                  filters.search
                }
                onChange={(
                  event
                ) =>
                  setFilters({
                    ...filters,
                    search:
                      event.target
                        .value,
                  })
                }
                placeholder="שם, טלפון, איש קשר או Run ID"
              />
            </label>

            <FilterSelect
              label="סטטוס"
              value={
                filters.status
              }
              onChange={(
                value
              ) =>
                setFilters({
                  ...filters,
                  status:
                    value,
                })
              }
              options={[
                [
                  "",
                  "הכול",
                ],
                [
                  "queued",
                  "בתור",
                ],
                [
                  "pending",
                  "ממתין להפעלה",
                ],
                [
                  "processing",
                  "בתהליך",
                ],
                [
                  "waiting",
                  "ממתין להמשך",
                ],
                [
                  "completed",
                  "הושלם",
                ],
                [
                  "failed",
                  "נכשל",
                ],
                [
                  "cancelled",
                  "בוטל",
                ],
              ]}
            />

            <FilterSelect
              label="אוטומציה"
              value={
                filters.flowId
              }
              onChange={(
                value
              ) =>
                setFilters({
                  ...filters,
                  flowId:
                    value,
                })
              }
              options={[
                [
                  "",
                  "כל האוטומציות",
                ],
                ...flowOptions,
              ]}
            />

            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                מתאריך
              </span>

              <input
                type="date"
                className={
                  fieldClass
                }
                value={
                  filters.dateFrom
                }
                onChange={(
                  event
                ) =>
                  setFilters({
                    ...filters,
                    dateFrom:
                      event.target
                        .value,
                  })
                }
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                עד תאריך
              </span>

              <input
                type="date"
                className={
                  fieldClass
                }
                value={
                  filters.dateTo
                }
                onChange={(
                  event
                ) =>
                  setFilters({
                    ...filters,
                    dateTo:
                      event.target
                        .value,
                  })
                }
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={
                clearFilters
              }
            >
              ניקוי
            </button>

            <button
              type="button"
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={
                applyFilters
              }
            >
              החלת סינון
            </button>
          </div>
        </section>

        {/* Runs table */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">
                הרצות
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                מוצגות{" "}
                {Math.min(
                  visibleRuns.length,
                  runs.length
                )}{" "}
                מתוך {runs.length} תוצאות שנטענו
              </p>
            </div>

            {autoRefresh ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                ניטור חי
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-500">
              טוען הרצות...
            </div>
          ) : runs.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              לא נמצאו הרצות.
            </div>
          ) : (
            <>
              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 text-right">
                        תאריך
                      </th>

                      <th className="px-4 py-3 text-right">
                        לקוח
                      </th>

                      <th className="px-4 py-3 text-right">
                        אוטומציה
                      </th>

                      <th className="px-4 py-3 text-right">
                        מקור הפעלה
                      </th>

                      <th className="px-4 py-3 text-right">
                        סטטוס
                      </th>

                      <th className="px-4 py-3 text-right">
                        שלב נוכחי / אחרון
                      </th>

                      <th className="px-4 py-3 text-center">
                        ניסיונות
                      </th>

                      <th className="px-4 py-3 text-center">
                        פעולה
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {visibleRuns.map(
                      (run) => (
                        <tr
                          key={
                            run.runId
                          }
                          className={[
                            "transition hover:bg-blue-50/40",
                            run.status ===
                            "failed"
                              ? "bg-red-50/30"
                              : "",
                          ].join(
                            " "
                          )}
                        >
                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                            {formatDateTime(
                              run.processingStartedAt ||
                                run.createdAt
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <div className="font-bold text-slate-900">
                              {run.contactName ||
                                run.contactId ||
                                "ללא איש קשר"}
                            </div>

                            {run.contactName &&
                            run.contactId ? (
                              <div
                                className="mt-1 max-w-40 truncate text-xs text-slate-400"
                                dir="ltr"
                                title={
                                  run.contactId
                                }
                              >
                                {run.contactId}
                              </div>
                            ) : null}
                          </td>

                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-800">
                              {run.flowName ||
                                run.flowId ||
                                "-"}
                            </div>
                          </td>

                          <td className="px-4 py-4 text-slate-600">
                            <span className="inline-flex items-center gap-2">
                              <span>
                                {triggerIcon(
                                  run.triggerType
                                )}
                              </span>

                              <span>
                                {triggerLabel(
                                  run.triggerType
                                )}
                              </span>
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={[
                                "inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold",
                                statusClass(
                                  run.status
                                ),
                              ].join(
                                " "
                              )}
                            >
                              {statusLabel(
                                run.status
                              )}
                            </span>

                            {run.status ===
                              "failed" &&
                            run.error ? (
                              <div className="mt-2 max-w-52 text-xs text-red-600">
                                <span className="line-clamp-1">
                                  {userFriendlyError(
                                    run.error
                                  )}
                                </span>
                              </div>
                            ) : null}
                          </td>

                          <td className="px-4 py-4">
                            <div className="max-w-56 font-medium text-slate-700">
                              {run.currentStepName ||
                                run.lastStepName ||
                                run.currentStepId ||
                                run.lastStepId ||
                                "-"}
                            </div>
                          </td>

                          <td className="px-4 py-4 text-center font-semibold text-slate-700">
                            {run.attempts ||
                              0}
                          </td>

                          <td className="px-4 py-4 text-center">
                            <RunDetailsLink
                              runId={
                                run.runId
                              }
                              agentId={
                                selectedAgentId ||
                                ""
                              }
                            />
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {visibleCount <
              runs.length ? (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                    onClick={() =>
                      setVisibleCount(
                        (
                          current
                        ) =>
                          current +
                          LOAD_MORE_COUNT
                      )
                    }
                  >
                    הצגת עוד{" "}
                    {Math.min(
                      LOAD_MORE_COUNT,
                      runs.length -
                        visibleCount
                    )}{" "}
                    הרצות
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-500">
          {label}
        </div>

        <div className="text-xl">
          {icon}
        </div>
      </div>

      <div className="mt-2 text-3xl font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  options: Array<
    [
      string,
      string,
    ]
  >;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>

      <select
        className={
          fieldClass
        }
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target
              .value
          )
        }
      >
        {options.map(
          ([
            optionValue,
            optionLabel,
          ]) => (
            <option
              key={
                optionValue
              }
              value={
                optionValue
              }
            >
              {optionLabel}
            </option>
          )
        )}
      </select>
    </label>
  );
}

function RunDetailsLink({
  runId,
  agentId,
}: {
  runId: string;
  agentId: string;
}) {
  const href =
    `/MagicTouch/Runs/${encodeURIComponent(
      runId
    )}` +
    (
      agentId
        ? `?agentId=${encodeURIComponent(
            agentId
          )}`
        : ""
    );

  return (
    <Link
      href={
        href
      }
      className="inline-flex whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
    >
      תחקור
    </Link>
  );
}