"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

import {
  useAuth,
} from "@/lib/firebase/AuthContext";

import {
  usePermission,
} from "@/hooks/usePermission";

import AccessDenied from "@/components/AccessDenied";

import MonitorTabs from "@/components/MagicTouch/Monitor/MonitorTabs";

type Schedule =
  | {
      type: "manual";
      timeZone: string;
    }
  | {
      type: "interval";
      every: number;
      unit: "hours" | "days";
      timeZone: string;
    }
  | {
      type: "daily";
      hour: number;
      minute: number;
      timeZone: string;
    }
  | {
      type: "monthly";
      dayOfMonth: number;
      hour: number;
      minute: number;
      timeZone: string;
    };

type Job = {
  id: string;
  jobId: string;
  name: string;
  description: string;
  action: string;
  enabled: boolean;
  schedule: Schedule;

  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;

  lastRunSummary?:
    | Record<string, unknown>
    | null;

  lastRunError?: string | null;
  runningRunId?: string | null;
};

type JobRun = {
  id: string;
  runId: string;

  jobId: string;
  jobName: string;

  source: string;
  status: string;

  requestedBy?: string | null;

  startedAt?: string | null;
  completedAt?: string | null;

  summary?:
    | Record<string, unknown>
    | null;

  error?: string | null;
};

type ListResult = {
  ok: boolean;
  jobs: Job[];
  recentRuns: JobRun[];
};

type SummaryItem = {
  label: string;
  value: string;
};

const TIME_ZONE =
  "Asia/Jerusalem";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function n(
  value: unknown
): number {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function errorMessage(
  error: unknown
): string {
  if (
    error &&
    typeof error ===
      "object" &&
    "message" in error
  ) {
    return (
      s(
        (
          error as {
            message?: unknown;
          }
        ).message
      ) ||
      "אירעה שגיאה"
    );
  }

  return "אירעה שגיאה לא ידועה";
}

function formatDate(
  value?:
    | string
    | null
): string {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? value
    : date.toLocaleString(
        "he-IL"
      );
}

function scheduleText(
  schedule: Schedule
): string {
  switch (
    schedule.type
  ) {
    case "manual":
      return "ידני בלבד";

    case "interval":
      return `כל ${schedule.every} ${
        schedule.unit ===
        "hours"
          ? "שעות"
          : "ימים"
      }`;

    case "daily":
      return `בכל יום בשעה ${String(
        schedule.hour
      ).padStart(
        2,
        "0"
      )}:${String(
        schedule.minute
      ).padStart(
        2,
        "0"
      )}`;

    case "monthly":
      return `בכל ${schedule.dayOfMonth} בחודש בשעה ${String(
        schedule.hour
      ).padStart(
        2,
        "0"
      )}:${String(
        schedule.minute
      ).padStart(
        2,
        "0"
      )}`;
  }
}

function statusLabel(
  status?:
    | string
    | null
): string {
  switch (status) {
    case "success":
      return "הצליח";

    case "failed":
      return "נכשל";

    case "running":
      return "רץ עכשיו";

    default:
      return "טרם רץ";
  }
}

function statusClass(
  status?:
    | string
    | null
): string {
  if (
    status ===
    "success"
  ) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (
    status ===
    "failed"
  ) {
    return "bg-red-100 text-red-700";
  }

  if (
    status ===
    "running"
  ) {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-slate-100 text-slate-600";
}

function jobIcon(
  job: Job
): string {
  if (
    job.action ===
    "syncMicrosoftBookingsAllAgents"
  ) {
    return "📅";
  }

  if (
    job.action ===
    "processWaitingPowerOfAttorneySignatures"
  ) {
    return "✍️";
  }

  return "⚙️";
}

function defaultEditorSchedule(
  schedule: Schedule
): {
  type:
    Schedule["type"];
  every: number;
  unit:
    | "hours"
    | "days";
  dayOfMonth: number;
  hour: number;
  minute: number;
} {
  return {
    type:
      schedule.type,

    every:
      schedule.type ===
      "interval"
        ? schedule.every
        : 1,

    unit:
      schedule.type ===
      "interval"
        ? schedule.unit
        : "days",

    dayOfMonth:
      schedule.type ===
      "monthly"
        ? schedule.dayOfMonth
        : 1,

    hour:
      schedule.type ===
        "daily" ||
      schedule.type ===
        "monthly"
        ? schedule.hour
        : 9,

    minute:
      schedule.type ===
        "daily" ||
      schedule.type ===
        "monthly"
        ? schedule.minute
        : 0,
  };
}

function getSummaryItems(
  jobAction: string,
  summary:
    | Record<string, unknown>
    | null
    | undefined
): SummaryItem[] {
  if (!summary) {
    return [];
  }

  if (
    jobAction ===
    "syncMicrosoftBookingsAllAgents"
  ) {
    return [
      {
        label:
          "חיבורי Bookings שנבדקו",
        value:
          String(
            n(
              summary.checkedAgents
            )
          ),
      },

      {
        label:
          "סוכנים מחוברים",
        value:
          String(
            n(
              summary.connectedAgents
            )
          ),
      },

      {
        label:
          "סונכרנו בהצלחה",
        value:
          String(
            n(
              summary.syncedAgents
            )
          ),
      },

      {
        label:
          "נכשלו",
        value:
          String(
            n(
              summary.failedAgents
            )
          ),
      },

      {
        label:
          "פגישות שנמצאו",
        value:
          String(
            n(
              summary.appointments
            )
          ),
      },

      {
        label:
          "שויכו לאנשי קשר",
        value:
          String(
            n(
              summary.matched
            )
          ),
      },

      {
        label:
          "ללא התאמה",
        value:
          String(
            n(
              summary.unmatched
            )
          ),
      },

      {
        label:
          "אירועים חדשים",
        value:
          String(
            n(
              summary.createdEvents
            )
          ),
      },

      {
        label:
          "אירועי ביטול",
        value:
          String(
            n(
              summary.cancelledEvents
            )
          ),
      },
    ];
  }

  if (
    jobAction ===
    "processWaitingPowerOfAttorneySignatures"
  ) {
    const mapping = [
      [
        "scanned",
        "נסרקו",
      ],
      [
        "processed",
        "עובדו",
      ],
      [
        "signed",
        "חתומים",
      ],
      [
        "partiallySigned",
        "חתומים חלקית",
      ],
      [
        "waiting",
        "ממתינים",
      ],
      [
        "remindersDue",
        "דורשי תזכורת",
      ],
      [
        "failed",
        "נכשלו",
      ],
    ] as const;

    return mapping
      .filter(
        ([
          key,
        ]) =>
          summary[key] !==
          undefined
      )
      .map(
        ([
          key,
          label,
        ]) => ({
          label,
          value:
            String(
              summary[key]
            ),
        })
      );
  }

  return Object.entries(
    summary
  )
    .filter(
      ([
        ,
        value,
      ]) =>
        typeof value ===
          "string" ||
        typeof value ===
          "number" ||
        typeof value ===
          "boolean"
    )
    .slice(
      0,
      8
    )
    .map(
      ([
        key,
        value,
      ]) => ({
        label:
          key,

        value:
          String(
            value
          ),
      })
    );
}

function summarySentence(
  jobAction: string,
  summary:
    | Record<string, unknown>
    | null
    | undefined
): string {
  if (!summary) {
    return "אין עדיין תוצאות";
  }

  if (
    jobAction ===
    "syncMicrosoftBookingsAllAgents"
  ) {
    return (
      `${n(
        summary.syncedAgents
      )} סוכנים סונכרנו בהצלחה` +
      ` · ${n(
        summary.appointments
      )} פגישות נמצאו` +
      ` · ${n(
        summary.matched
      )} שויכו` +
      ` · ${n(
        summary.failedAgents
      )} נכשלו`
    );
  }

  if (
    jobAction ===
    "processWaitingPowerOfAttorneySignatures"
  ) {
    return (
      `${n(
        summary.processed
      )} אנשי קשר עובדו` +
      ` · ${n(
        summary.signed
      )} חתומים` +
      ` · ${n(
        summary.waiting
      )} ממתינים` +
      ` · ${n(
        summary.failed
      )} נכשלו`
    );
  }

  return "הריצה הסתיימה";
}

export default function MagicTouchJobsPage() {
  const {
    user,
    isLoading,
  } =
    useAuth() as any;

  const {
    canAccess,
    isChecking,
  } =
    usePermission(
      user
        ? "access_magic_touch_jobs_admin"
        : null
    );

  const [
    jobs,
    setJobs,
  ] =
    useState<Job[]>(
      []
    );

  const [
    recentRuns,
    setRecentRuns,
  ] =
    useState<JobRun[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    savingJobId,
    setSavingJobId,
  ] =
    useState(
      ""
    );

  const [
    runningJobId,
    setRunningJobId,
  ] =
    useState(
      ""
    );

  const [
    editingJobId,
    setEditingJobId,
  ] =
    useState(
      ""
    );

  const [
    selectedJobId,
    setSelectedJobId,
  ] =
    useState(
      ""
    );

  const [
    editor,
    setEditor,
  ] =
    useState({
      type:
        "manual" as
          Schedule["type"],

      every:
        1,

      unit:
        "days" as
          | "hours"
          | "days",

      dayOfMonth:
        1,

      hour:
        9,

      minute:
        0,
    });

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    success,
    setSuccess,
  ] =
    useState(
      ""
    );

  const load =
    useCallback(
      async () => {
        setLoading(
          true
        );

        setError(
          ""
        );

        try {
          const fn =
            httpsCallable<
              Record<
                string,
                never
              >,
              ListResult
            >(
              functions,
              "listMagicTouchJobs"
            );

          const response =
            await fn({});

          setJobs(
            response.data
              .jobs ||
              []
          );

          setRecentRuns(
            response.data
              .recentRuns ||
              []
          );
        } catch (
          loadError
        ) {
          setError(
            errorMessage(
              loadError
            )
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );

  useEffect(
    () => {
      if (
        !isLoading &&
        !isChecking &&
        canAccess
      ) {
        void load();
      }
    },
    [
      isLoading,
      isChecking,
      canAccess,
      load,
    ]
  );

  const beginEdit =
    (
      job: Job
    ) => {
      setEditingJobId(
        job.id
      );

      setEditor(
        defaultEditorSchedule(
          job.schedule
        )
      );

      setError(
        ""
      );

      setSuccess(
        ""
      );
    };

  const buildSchedule =
    (): Schedule => {
      if (
        editor.type ===
        "interval"
      ) {
        return {
          type:
            "interval",

          every:
            Math.max(
              1,
              Number(
                editor.every
              ) ||
                1
            ),

          unit:
            editor.unit,

          timeZone:
            TIME_ZONE,
        };
      }

      if (
        editor.type ===
        "daily"
      ) {
        return {
          type:
            "daily",

          hour:
            Math.min(
              23,
              Math.max(
                0,
                Number(
                  editor.hour
                ) ||
                  0
              )
            ),

          minute:
            Math.min(
              59,
              Math.max(
                0,
                Number(
                  editor.minute
                ) ||
                  0
              )
            ),

          timeZone:
            TIME_ZONE,
        };
      }

      if (
        editor.type ===
        "monthly"
      ) {
        return {
          type:
            "monthly",

          dayOfMonth:
            Math.min(
              31,
              Math.max(
                1,
                Number(
                  editor.dayOfMonth
                ) ||
                  1
              )
            ),

          hour:
            Math.min(
              23,
              Math.max(
                0,
                Number(
                  editor.hour
                ) ||
                  0
              )
            ),

          minute:
            Math.min(
              59,
              Math.max(
                0,
                Number(
                  editor.minute
                ) ||
                  0
              )
            ),

          timeZone:
            TIME_ZONE,
        };
      }

      return {
        type:
          "manual",

        timeZone:
          TIME_ZONE,
      };
    };

  const saveJob =
    async (
      job: Job,
      enabled:
        boolean =
        job.enabled
    ) => {
      setSavingJobId(
        job.id
      );

      setError(
        ""
      );

      setSuccess(
        ""
      );

      try {
        const fn =
          httpsCallable<
            {
              jobId:
                string;

              enabled:
                boolean;

              schedule:
                Schedule;
            },
            {
              ok:
                boolean;
            }
          >(
            functions,
            "updateMagicTouchJob"
          );

        await fn({
          jobId:
            job.id,

          enabled,

          schedule:
            editingJobId ===
            job.id
              ? buildSchedule()
              : job.schedule,
        });

        setSuccess(
          "הגדרת העיבוד נשמרה."
        );

        setEditingJobId(
          ""
        );

        await load();
      } catch (
        saveError
      ) {
        setError(
          errorMessage(
            saveError
          )
        );
      } finally {
        setSavingJobId(
          ""
        );
      }
    };

  const runNow =
    async (
      job: Job
    ) => {
      const approved =
        window.confirm(
          `להריץ עכשיו את "${job.name}"?`
        );

      if (!approved) {
        return;
      }

      setRunningJobId(
        job.id
      );

      setError(
        ""
      );

      setSuccess(
        ""
      );

      try {
        const fn =
          httpsCallable<
            {
              jobId:
                string;
            },
            {
              ok:
                boolean;

              summary?:
                Record<
                  string,
                  unknown
                >;
            }
          >(
            functions,
            "runMagicTouchJobNow"
          );

        await fn({
          jobId:
            job.id,
        });

        setSuccess(
          `העיבוד "${job.name}" הסתיים בהצלחה.`
        );

        setSelectedJobId(
          job.id
        );

        await load();
      } catch (
        runError
      ) {
        setError(
          errorMessage(
            runError
          )
        );
      } finally {
        setRunningJobId(
          ""
        );
      }
    };

  const enabledCount =
    useMemo(
      () =>
        jobs.filter(
          (
            job
          ) =>
            job.enabled
        ).length,
      [
        jobs,
      ]
    );

  const successfulCount =
    useMemo(
      () =>
        jobs.filter(
          (
            job
          ) =>
            job.lastRunStatus ===
            "success"
        ).length,
      [
        jobs,
      ]
    );

  const failedCount =
    useMemo(
      () =>
        jobs.filter(
          (
            job
          ) =>
            job.lastRunStatus ===
            "failed"
        ).length,
      [
        jobs,
      ]
    );

  const selectedJob =
    useMemo(
      () =>
        jobs.find(
          (
            job
          ) =>
            job.id ===
            selectedJobId
        ) ||
        null,
      [
        jobs,
        selectedJobId,
      ]
    );

  const selectedJobRuns =
    useMemo(
      () =>
        selectedJobId
          ? recentRuns.filter(
              (
                run
              ) =>
                run.jobId ===
                selectedJobId
            )
          : [],
      [
        recentRuns,
        selectedJobId,
      ]
    );

  if (
    isLoading ||
    isChecking
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-7xl p-6"
      >
        טוען ניהול עיבודים...
      </main>
    );
  }

  if (
    !canAccess
  ) {
    return (
      <AccessDenied />
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 px-4 py-6 text-right sm:px-6"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <MonitorTabs />

        <header>
          <div className="text-sm font-semibold text-blue-600">
            MagicTouch · עיבודים וכלי מערכת
          </div>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            ניהול עיבודים
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            עיבודי מערכת שרצים ידנית או לפי תזמון.
            בחרי עיבוד כדי לצפות בפרטי ההרצות שלו.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <HeaderStat
            label="עיבודים"
            value={
              jobs.length
            }
          />

          <HeaderStat
            label="הרצה אחרונה תקינה"
            value={
              successfulCount
            }
          />

          <HeaderStat
            label="עיבודים עם כשל אחרון"
            value={
              failedCount
            }
            danger={
              failedCount >
              0
            }
          />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
            {success}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            טוען עיבודים...
          </div>
        ) : (
          <section className="space-y-4">
            {jobs.map(
              (
                job
              ) => {
                const expanded =
                  selectedJobId ===
                  job.id;

                const summaryItems =
                  getSummaryItems(
                    job.action,
                    job.lastRunSummary
                  );

                return (
                  <article
                    key={
                      job.id
                    }
                    className={[
                      "overflow-hidden rounded-2xl border bg-white shadow-sm transition",

                      expanded
                        ? "border-blue-300 ring-2 ring-blue-50"
                        : "border-slate-200",
                    ].join(
                      " "
                    )}
                  >
                    <div className="p-5">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                            {jobIcon(
                              job
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-lg font-bold text-slate-900">
                                {
                                  job.name
                                }
                              </h2>

                              <span
                                className={[
                                  "rounded-full px-3 py-1 text-xs font-bold",

                                  job.enabled
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-600",
                                ].join(
                                  " "
                                )}
                              >
                                {job.enabled
                                  ? "תזמון פעיל"
                                  : "ללא תזמון פעיל"}
                              </span>

                              <span
                                className={[
                                  "rounded-full px-3 py-1 text-xs font-bold",
                                  statusClass(
                                    job.lastRunStatus
                                  ),
                                ].join(
                                  " "
                                )}
                              >
                                {statusLabel(
                                  job.lastRunStatus
                                )}
                              </span>
                            </div>

                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                              {
                                job.description
                              }
                            </p>

                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                              <span>
                                <strong className="text-slate-700">
                                  תזמון:
                                </strong>{" "}
                                {scheduleText(
                                  job.schedule
                                )}
                              </span>

                              <span>
                                <strong className="text-slate-700">
                                  ריצה אחרונה:
                                </strong>{" "}
                                {formatDate(
                                  job.lastRunAt
                                )}
                              </span>

                              {job.enabled &&
                              job.nextRunAt ? (
                                <span>
                                  <strong className="text-slate-700">
                                    ריצה הבאה:
                                  </strong>{" "}
                                  {formatDate(
                                    job.nextRunAt
                                  )}
                                </span>
                              ) : null}
                            </div>

                            {job.lastRunStatus ===
                            "success" ? (
                              <div className="mt-3 inline-flex rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                                ✓{" "}
                                {summarySentence(
                                  job.action,
                                  job.lastRunSummary
                                )}
                              </div>
                            ) : null}

                            {job.lastRunStatus ===
                              "failed" &&
                            job.lastRunError ? (
                              <div className="mt-3 inline-flex rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                                ✕{" "}
                                {
                                  job.lastRunError
                                }
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                            disabled={
                              runningJobId ===
                              job.id
                            }
                            onClick={() =>
                              void runNow(
                                job
                              )
                            }
                          >
                            {runningJobId ===
                            job.id
                              ? "מריץ..."
                              : "הרץ עכשיו"}
                          </button>

                          <button
                            type="button"
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              setSelectedJobId(
                                expanded
                                  ? ""
                                  : job.id
                              )
                            }
                          >
                            {expanded
                              ? "סגור פירוט"
                              : "פירוט וריצות"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="border-t border-slate-100 bg-slate-50/60 p-5">
                        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                          <div className="space-y-5">
                            <section>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <h3 className="font-bold text-slate-900">
                                    תוצאה אחרונה
                                  </h3>

                                  <p className="mt-1 text-xs text-slate-500">
                                    סיכום עסקי של ההרצה האחרונה.
                                  </p>
                                </div>
                              </div>

                              {summaryItems.length ===
                              0 ? (
                                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
                                  עדיין אין תוצאה להצגה.
                                </div>
                              ) : (
                                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                  {summaryItems.map(
                                    (
                                      item
                                    ) => (
                                      <Info
                                        key={
                                          item.label
                                        }
                                        label={
                                          item.label
                                        }
                                        value={
                                          item.value
                                        }
                                      />
                                    )
                                  )}
                                </div>
                              )}
                            </section>

                            <section>
                              <div>
                                <h3 className="font-bold text-slate-900">
                                  ריצות של העיבוד
                                </h3>

                                <p className="mt-1 text-xs text-slate-500">
                                  ההיסטוריה מוצגת רק עבור העיבוד שבחרת.
                                </p>
                              </div>

                              {selectedJobRuns.length ===
                              0 ? (
                                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
                                  עדיין אין ריצות לעיבוד הזה.
                                </div>
                              ) : (
                                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                  <table className="min-w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-600">
                                      <tr>
                                        <th className="px-4 py-3 text-right">
                                          התחלה
                                        </th>

                                        <th className="px-4 py-3 text-right">
                                          מקור
                                        </th>

                                        <th className="px-4 py-3 text-right">
                                          סטטוס
                                        </th>

                                        <th className="px-4 py-3 text-right">
                                          תוצאה
                                        </th>
                                      </tr>
                                    </thead>

                                    <tbody className="divide-y divide-slate-100">
                                      {selectedJobRuns.map(
                                        (
                                          run
                                        ) => (
                                          <tr
                                            key={
                                              run.id
                                            }
                                          >
                                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                              {formatDate(
                                                run.startedAt
                                              )}
                                            </td>

                                            <td className="px-4 py-3 text-slate-600">
                                              {run.source ===
                                              "manual"
                                                ? "ידני"
                                                : "מתוזמן"}
                                            </td>

                                            <td className="px-4 py-3">
                                              <span
                                                className={[
                                                  "rounded-full px-3 py-1 text-xs font-bold",
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
                                            </td>

                                            <td className="px-4 py-3 text-slate-600">
                                              {run.error ? (
                                                <span className="text-red-700">
                                                  {
                                                    run.error
                                                  }
                                                </span>
                                              ) : (
                                                summarySentence(
                                                  job.action,
                                                  run.summary
                                                )
                                              )}
                                            </td>
                                          </tr>
                                        )
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </section>
                          </div>

                          <aside className="space-y-3">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <h3 className="font-bold text-slate-900">
                                הגדרות העיבוד
                              </h3>

                              <div className="mt-4 space-y-3">
                                <Info
                                  label="תזמון"
                                  value={scheduleText(
                                    job.schedule
                                  )}
                                />

                                <Info
                                  label="ריצה הבאה"
                                  value={
                                    job.enabled
                                      ? formatDate(
                                          job.nextRunAt
                                        )
                                      : "לא מתוזמן"
                                  }
                                />
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700"
                                  onClick={() =>
                                    beginEdit(
                                      job
                                    )
                                  }
                                >
                                  עריכת תזמון
                                </button>

                                <button
                                  type="button"
                                  className={[
                                    "rounded-xl px-3 py-2 text-sm font-bold",

                                    job.enabled
                                      ? "border border-red-200 bg-red-50 text-red-700"
                                      : "border border-emerald-200 bg-emerald-50 text-emerald-700",
                                  ].join(
                                    " "
                                  )}
                                  disabled={
                                    savingJobId ===
                                    job.id
                                  }
                                  onClick={() =>
                                    void saveJob(
                                      job,
                                      !job.enabled
                                    )
                                  }
                                >
                                  {job.enabled
                                    ? "השבת תזמון"
                                    : "הפעל תזמון"}
                                </button>
                              </div>
                            </div>
                          </aside>
                        </div>

                        {editingJobId ===
                        job.id ? (
                          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                            <h3 className="font-bold text-blue-950">
                              עריכת תזמון
                            </h3>

                            <div className="mt-4 grid gap-4 md:grid-cols-5">
                              <label className="block">
                                <span className="mb-2 block text-sm font-bold text-slate-700">
                                  סוג תזמון
                                </span>

                                <select
                                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                                  value={
                                    editor.type
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setEditor({
                                      ...editor,

                                      type:
                                        event.target
                                          .value as
                                          Schedule["type"],
                                    })
                                  }
                                >
                                  <option value="manual">
                                    ידני בלבד
                                  </option>

                                  <option value="interval">
                                    כל X זמן
                                  </option>

                                  <option value="daily">
                                    יומי בשעה
                                  </option>

                                  <option value="monthly">
                                    חודשי ביום ובשעה
                                  </option>
                                </select>
                              </label>

                              {editor.type ===
                              "interval" ? (
                                <>
                                  <NumberField
                                    label="כל"
                                    value={
                                      editor.every
                                    }
                                    min={
                                      1
                                    }
                                    max={
                                      365
                                    }
                                    onChange={(
                                      every
                                    ) =>
                                      setEditor({
                                        ...editor,
                                        every,
                                      })
                                    }
                                  />

                                  <label className="block">
                                    <span className="mb-2 block text-sm font-bold text-slate-700">
                                      יחידה
                                    </span>

                                    <select
                                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                                      value={
                                        editor.unit
                                      }
                                      onChange={(
                                        event
                                      ) =>
                                        setEditor({
                                          ...editor,

                                          unit:
                                            event.target
                                              .value as
                                              | "hours"
                                              | "days",
                                        })
                                      }
                                    >
                                      <option value="hours">
                                        שעות
                                      </option>

                                      <option value="days">
                                        ימים
                                      </option>
                                    </select>
                                  </label>
                                </>
                              ) : null}

                              {editor.type ===
                              "monthly" ? (
                                <NumberField
                                  label="יום בחודש"
                                  value={
                                    editor.dayOfMonth
                                  }
                                  min={
                                    1
                                  }
                                  max={
                                    31
                                  }
                                  onChange={(
                                    dayOfMonth
                                  ) =>
                                    setEditor({
                                      ...editor,
                                      dayOfMonth,
                                    })
                                  }
                                />
                              ) : null}

                              {editor.type ===
                                "daily" ||
                              editor.type ===
                                "monthly" ? (
                                <>
                                  <NumberField
                                    label="שעה"
                                    value={
                                      editor.hour
                                    }
                                    min={
                                      0
                                    }
                                    max={
                                      23
                                    }
                                    onChange={(
                                      hour
                                    ) =>
                                      setEditor({
                                        ...editor,
                                        hour,
                                      })
                                    }
                                  />

                                  <NumberField
                                    label="דקות"
                                    value={
                                      editor.minute
                                    }
                                    min={
                                      0
                                    }
                                    max={
                                      59
                                    }
                                    onChange={(
                                      minute
                                    ) =>
                                      setEditor({
                                        ...editor,
                                        minute,
                                      })
                                    }
                                  />
                                </>
                              ) : null}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white"
                                disabled={
                                  savingJobId ===
                                  job.id
                                }
                                onClick={() =>
                                  void saveJob(
                                    job
                                  )
                                }
                              >
                                {savingJobId ===
                                job.id
                                  ? "שומר..."
                                  : "שמירת תזמון"}
                              </button>

                              <button
                                type="button"
                                className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-700"
                                onClick={() =>
                                  setEditingJobId(
                                    ""
                                  )
                                }
                              >
                                ביטול
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              }
            )}
          </section>
        )}

        {!loading &&
        jobs.length ===
          0 ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="font-bold text-slate-800">
              עדיין אין עיבודים
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function HeaderStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-400">
        {label}
      </div>

      <div
        className={[
          "mt-1 text-3xl font-bold",

          danger
            ? "text-red-700"
            : "text-slate-900",
        ].join(
          " "
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-sm font-semibold leading-6 text-slate-800">
        {value}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (
    value: number
  ) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </span>

      <input
        type="number"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
        value={
          value
        }
        min={
          min
        }
        max={
          max
        }
        onChange={(
          event
        ) =>
          onChange(
            Number(
              event.target
                .value
            )
          )
        }
      />
    </label>
  );
}