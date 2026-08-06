"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useMagicTouchAgent } from "@/components/MagicTouch/MagicTouchAgentContext";

import {
  getMagicTouchFlowRuns,
} from "@/lib/MagicTouch/runs/api";

import type {
  MagicTouchFlowRun,
} from "@/lib/MagicTouch/runs/types";

import MonitorRunCard from "@/components/MagicTouch/Monitor/MonitorRunCard";
import MonitorPerformancePanel from "@/components/MagicTouch/Monitor/MonitorPerformancePanel";
import MonitorFlowHeatmap from "@/components/MagicTouch/Monitor/MonitorFlowHeatmap";

import {
  averageDurationLabel,
  formatDateTime,
  triggerIcon,
  triggerLabel,
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

const AUTO_REFRESH_SECONDS =
  15;

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
    useState(
      true
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    autoRefresh,
    setAutoRefresh,
  ] =
    useState(
      false
    );

  const [
    viewMode,
    setViewMode,
  ] =
    useState<
      "cards" |
      "compact"
    >(
      "cards"
    );

  const [
    lastLoadedAt,
    setLastLoadedAt,
  ] =
    useState<
      number |
      null
    >(
      null
    );

  const loadRuns =
    useCallback(
      async (
        silent =
          false
      ) => {
        if (
          !selectedAgentId
        ) {
          setRuns([]);
          setLoading(false);
          return;
        }

        if (
          !silent
        ) {
          setLoading(
            true
          );
        }

        setError(
          ""
        );

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
          loadError:
            any
        ) {
          console.error(
            "[MagicTouchMonitor] load failed",
            loadError
          );

          setRuns([]);

          setError(
            loadError?.message ||
            "טעינת ההרצות נכשלה."
          );
        } finally {
          if (
            !silent
          ) {
            setLoading(
              false
            );
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
      if (
        !autoRefresh
      ) {
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
          if (
            run.flowId
          ) {
            map.set(
              run.flowId,
              run.flowName ||
              run.flowId
            );
          }
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
            (
              run
            ) =>
              run.status ===
              "completed"
          ).length;

        const failed =
          runs.filter(
            (
              run
            ) =>
              run.status ===
              "failed"
          ).length;

        const active =
          runs.filter(
            (
              run
            ) =>
              run.status ===
                "processing" ||
              run.status ===
                "pending"
          ).length;

        const finished =
          completed +
          failed;

        return {
          completed,
          failed,
          active,
          successRate:
            finished >
            0
              ? Math.round(
                completed /
                finished *
                100
              )
              : 0,
          average:
            averageDurationLabel(
              runs
            ),
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
              map.get(
                key
              ) ||
              0
            ) +
            1
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
    runs.filter(
      (
        run
      ) =>
        run.status ===
        "failed"
    ).slice(
      0,
      4
    );

  const applyFilters = () => {
    setAppliedFilters(
      filters
    );
  };

  const clearFilters = () => {
    setFilters(
      INITIAL_FILTERS
    );

    setAppliedFilters(
      INITIAL_FILTERS
    );
  };

  const selectFlow = (
    flowId:
      string
  ) => {
    const next = {
      ...filters,
      flowId,
    };

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
              MagicTouch Monitor
            </div>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              מרכז בקרת אוטומציות
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              מצב הרצות, ביצועים, כשלים ושלבים פעילים במקום אחד.
            </p>

            {lastLoadedAt ? (
              <p className="mt-2 text-xs text-slate-400">
                עודכן לאחרונה: {
                  formatDateTime(
                    lastLoadedAt
                  )
                }
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
                    event
                      .target
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
            {
              error
            }
          </div>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="סה״כ"
            value={
              String(
                runs.length
              )
            }
            icon="📊"
          />

          <MetricCard
            label="פעילות"
            value={
              String(
                metrics.active
              )
            }
            icon="▶️"
          />

          <MetricCard
            label="הושלמו"
            value={
              String(
                metrics.completed
              )
            }
            icon="✅"
          />

          <MetricCard
            label="נכשלו"
            value={
              String(
                metrics.failed
              )
            }
            icon="❌"
          />

          <MetricCard
            label="הצלחה"
            value={`${metrics.successRate}%`}
            icon="🎯"
          />

          <MetricCard
            label="משך ממוצע"
            value={
              metrics.average
            }
            icon="⏱️"
          />
        </section>

        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <MonitorPerformancePanel
            runs={
              runs
            }
          />

          <MonitorFlowHeatmap
            runs={
              runs
            }
            onSelectFlow={
              selectFlow
            }
          />
        </div>

        {failedRuns.length >
        0 ? (
          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div>
              <h2 className="font-bold text-red-800">
                כשלים אחרונים
              </h2>

              <p className="mt-1 text-sm text-red-600">
                הרצות שדורשות בדיקה.
              </p>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {failedRuns.map(
                (
                  run
                ) => (
                  <MonitorRunCard
                    key={
                      run.runId
                    }
                    run={
                      run
                    }
                    agentId={
                      selectedAgentId ||
                      ""
                    }
                  />
                )
              )}
            </div>
          </section>
        ) : null}

        {triggerBreakdown.length >
        0 ? (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">
              מקורות אירוע
            </h2>

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
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => {
                      const next = {
                        ...filters,
                        triggerType,
                      };

                      setFilters(
                        next
                      );

                      setAppliedFilters(
                        next
                      );
                    }}
                  >
                    <div className="text-xl">
                      {
                        triggerIcon(
                          triggerType
                        )
                      }
                    </div>

                    <div className="mt-2 text-sm font-bold text-slate-800">
                      {
                        triggerLabel(
                          triggerType
                        )
                      }
                    </div>

                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      {
                        count
                      }
                    </div>
                  </button>
                )
              )}
            </div>
          </section>
        ) : null}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <label className="xl:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                חיפוש
              </span>

              <input
                className={fieldClass}
                value={
                  filters.search
                }
                onChange={(
                  event
                ) =>
                  setFilters({
                    ...filters,
                    search:
                      event
                        .target
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
                ["", "הכול"],
                ["pending", "ממתין"],
                ["processing", "בתהליך"],
                ["completed", "הושלם"],
                ["failed", "נכשל"],
                ["cancelled", "בוטל"],
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
                ["", "כל האוטומציות"],
                ...flowOptions,
              ]}
            />

            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                מתאריך
              </span>

              <input
                type="date"
                className={fieldClass}
                value={
                  filters.dateFrom
                }
                onChange={(
                  event
                ) =>
                  setFilters({
                    ...filters,
                    dateFrom:
                      event
                        .target
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
                className={fieldClass}
                value={
                  filters.dateTo
                }
                onChange={(
                  event
                ) =>
                  setFilters({
                    ...filters,
                    dateTo:
                      event
                        .target
                        .value,
                  })
                }
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-bold",
                  viewMode ===
                    "cards"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500",
                ].join(
                  " "
                )}
                onClick={() =>
                  setViewMode(
                    "cards"
                  )
                }
              >
                כרטיסים
              </button>

              <button
                type="button"
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-bold",
                  viewMode ===
                    "compact"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500",
                ].join(
                  " "
                )}
                onClick={() =>
                  setViewMode(
                    "compact"
                  )
                }
              >
                קומפקטי
              </button>
            </div>

            <div className="flex gap-3">
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
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">
                הרצות
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                {
                  runs.length
                } תוצאות
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
          ) : runs.length ===
            0 ? (
            <div className="p-10 text-center text-slate-500">
              לא נמצאו הרצות.
            </div>
          ) : (
            <div
              className={[
                "mt-5 grid gap-4",
                viewMode ===
                  "cards"
                  ? "lg:grid-cols-2"
                  : "grid-cols-1",
              ].join(
                " "
              )}
            >
              {runs.map(
                (
                  run
                ) => (
                  <MonitorRunCard
                    key={
                      run.runId
                    }
                    run={
                      run
                    }
                    agentId={
                      selectedAgentId ||
                      ""
                    }
                  />
                )
              )}
            </div>
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
  label:
    string;
  value:
    string;
  icon:
    string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-500">
          {
            label
          }
        </div>

        <div className="text-xl">
          {
            icon
          }
        </div>
      </div>

      <div className="mt-2 text-3xl font-bold text-slate-900">
        {
          value
        }
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
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string
    ) => void;
  options:
    Array<
      [
        string,
        string,
      ]
    >;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {
          label
        }
      </span>

      <select
        className={fieldClass}
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event
              .target
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
              {
                optionLabel
              }
            </option>
          )
        )}
      </select>
    </label>
  );
}
