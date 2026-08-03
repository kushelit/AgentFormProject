"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  useParams,
  useSearchParams,
} from "next/navigation";

import useFetchAgentData from "@/hooks/useFetchAgentData";

import {
  getMagicTouchFlowRunDetails,
} from "@/lib/MagicTouch/runs/api";

import type {
  MagicTouchFlowRun,
} from "@/lib/MagicTouch/runs/types";

import MonitorLiveConsole from "@/components/MagicTouch/Monitor/MonitorLiveConsole";
import MonitorVisualFlow from "@/components/MagicTouch/Monitor/MonitorVisualFlow";

import {
  formatDateTime,
  statusClass,
  statusLabel,
  triggerLabel,
  userFriendlyError,
} from "@/components/MagicTouch/Monitor/monitorHelpers";

const AUTO_REFRESH_SECONDS =
  10;

export default function MagicTouchRunDetailsPage() {
  const params =
    useParams<{
      runId:
        string;
    }>();

  const searchParams =
    useSearchParams();

  const {
    selectedAgentId,
  } =
    useFetchAgentData();

  const runId =
    String(
      params?.runId ||
      ""
    ).trim();

  const agentId =
    String(
      searchParams.get(
        "agentId"
      ) ||
      selectedAgentId ||
      ""
    ).trim();

  const [
    run,
    setRun,
  ] =
    useState<
      MagicTouchFlowRun |
      null
    >(
      null
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

  const loadRun =
    useCallback(
      async (
        silent =
          false
      ) => {
        if (
          !agentId ||
          !runId
        ) {
          setRun(
            null
          );
          setLoading(
            false
          );
          setError(
            "לא נמצאו מזהי הרצה או סוכן."
          );
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
            await getMagicTouchFlowRunDetails({
              agentId,
              runId,
            });

          setRun(
            response.run ||
            null
          );
        } catch (
          loadError:
            any
        ) {
          console.error(
            "[MagicTouchRunDetails] load failed",
            loadError
          );

          setRun(
            null
          );

          setError(
            loadError?.message ||
            "טעינת פרטי ההרצה נכשלה."
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
        agentId,
        runId,
      ]
    );

  useEffect(
    () => {
      void loadRun();
    },
    [
      loadRun,
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
            void loadRun(
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
      loadRun,
    ]
  );

  useEffect(
    () => {
      if (
        run?.status ===
          "completed" ||
        run?.status ===
          "failed" ||
        run?.status ===
          "cancelled"
      ) {
        setAutoRefresh(
          false
        );
      }
    },
    [
      run?.status,
    ]
  );

  const progress =
    useMemo(
      () => {
        if (
          !run ||
          run
            .stepHistory
            .length ===
            0
        ) {
          return 0;
        }

        const finished =
          run
            .stepHistory
            .filter(
              (
                step
              ) =>
                step.status ===
                  "completed" ||
                step.status ===
                  "continue"
            )
            .length;

        return Math.round(
          finished /
          run
            .stepHistory
            .length *
          100
        );
      },
      [
        run,
      ]
    );

  const lastError =
    run?.error ||
    run?.stepHistory.find(
      (
        step
      ) =>
        step.status ===
          "failed" &&
        step.error
    )?.error ||
    null;

  if (
    loading
  ) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 p-8 text-center text-slate-500"
      >
        טוען את פרטי ההרצה...
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/MagicTouch/Runs"
              className="text-sm font-semibold text-blue-700 hover:underline"
            >
              ← חזרה ל־Monitor
            </Link>

            <h1 className="mt-3 text-3xl font-bold text-slate-900">
              פרטי הרצה
            </h1>

            <p
              className="mt-2 break-all text-xs text-slate-400"
              dir="ltr"
            >
              {
                runId
              }
            </p>
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

              מעקב חי
            </label>

            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() =>
                void loadRun()
              }
            >
              רענון
            </button>

            <button
              type="button"
              disabled
              title="Replay דורש חיבור למנוע ההרצה הקיים"
              className="cursor-not-allowed rounded-xl bg-slate-300 px-4 py-2.5 text-sm font-semibold text-white"
            >
              ▶ Replay
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

        {!run ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            ההרצה לא נמצאה.
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-blue-600">
                    {
                      run.flowName ||
                      run.flowId
                    }
                  </div>

                  <h2 className="mt-1 text-2xl font-bold text-slate-900">
                    {
                      statusLabel(
                        run.status
                      )
                    }
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    {
                      triggerLabel(
                        run.triggerType
                      )
                    } · {
                      run.contactName ||
                      run.contactId ||
                      "ללא איש קשר"
                    }
                  </p>
                </div>

                <span
                  className={[
                    "rounded-full border px-3 py-1.5 text-sm font-bold",
                    statusClass(
                      run.status
                    ),
                  ].join(
                    " "
                  )}
                >
                  {
                    statusLabel(
                      run.status
                    )
                  }
                </span>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>
                    התקדמות
                  </span>

                  <span>
                    {
                      progress
                    }%
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{
                      width:
                        `${progress}%`,
                    }}
                  />
                </div>
              </div>
            </section>

            {lastError ? (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
                <h2 className="font-bold text-red-800">
                  סיבת הכשל
                </h2>

                <p className="mt-2 text-red-700">
                  {
                    userFriendlyError(
                      lastError
                    )
                  }
                </p>

                <details className="mt-4 rounded-xl border border-red-200 bg-white/70">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-red-700">
                    הצגת פרטים טכניים
                  </summary>

                  <pre
                    className="max-h-72 overflow-auto whitespace-pre-wrap break-all border-t border-red-200 p-4 text-xs text-red-700"
                    dir="ltr"
                  >
                    {
                      JSON.stringify(
                        lastError,
                        null,
                        2
                      )
                    }
                  </pre>
                </details>
              </section>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard
                label="התחלה"
                value={
                  formatDateTime(
                    run
                      .processingStartedAt ||
                    run.createdAt
                  )
                }
              />

              <InfoCard
                label="סיום"
                value={
                  formatDateTime(
                    run.completedAt
                  )
                }
              />

              <InfoCard
                label="שלב נוכחי"
                value={
                  run.currentStepName ||
                  run.lastStepName ||
                  run.currentStepId ||
                  run.lastStepId ||
                  "—"
                }
              />

              <InfoCard
                label="ניסיונות"
                value={
                  String(
                    run.attempts ||
                    0
                  )
                }
              />
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
              <MonitorVisualFlow
                run={
                  run
                }
              />

              <MonitorLiveConsole
                run={
                  run
                }
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">
        {
          label
        }
      </div>

      <div className="mt-2 break-words font-bold text-slate-900">
        {
          value
        }
      </div>
    </div>
  );
}
