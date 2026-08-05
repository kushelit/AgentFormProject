"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";

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
  lastRunSummary?: Record<string, unknown> | null;
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
  summary?: Record<string, unknown> | null;
  error?: string | null;
};

type ListResult = {
  ok: boolean;
  jobs: Job[];
  recentRuns: JobRun[];
};

const TIME_ZONE = "Asia/Jerusalem";

const monitorTabs = [
  {
    href: "/MagicTouch/Monitor",
    label: "ייפויי כוח",
    icon: "✍️",
  },
  {
    href: "/MagicTouch/Monitor/Jobs",
    label: "עיבודים",
    icon: "🕒",
  },
  {
    href: "/MagicTouch/Monitor/Tools",
    label: "כלי בדיקה",
    icon: "🧪",
  },
];

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return (
      s(
        (
          error as {
            message?: unknown;
          }
        ).message
      ) || "אירעה שגיאה"
    );
  }

  return "אירעה שגיאה לא ידועה";
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("he-IL");
}

function scheduleText(schedule: Schedule): string {
  switch (schedule.type) {
    case "manual":
      return "ידני בלבד";

    case "interval":
      return `כל ${schedule.every} ${
        schedule.unit === "hours" ? "שעות" : "ימים"
      }`;

    case "daily":
      return `בכל יום בשעה ${String(schedule.hour).padStart(
        2,
        "0"
      )}:${String(schedule.minute).padStart(2, "0")}`;

    case "monthly":
      return `בכל ${schedule.dayOfMonth} בחודש בשעה ${String(
        schedule.hour
      ).padStart(2, "0")}:${String(schedule.minute).padStart(
        2,
        "0"
      )}`;
  }
}

function statusClass(status?: string | null): string {
  if (status === "success") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "failed") {
    return "bg-red-100 text-red-700";
  }

  if (status === "running") {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-slate-100 text-slate-600";
}

function defaultEditorSchedule(schedule: Schedule): {
  type: Schedule["type"];
  every: number;
  unit: "hours" | "days";
  dayOfMonth: number;
  hour: number;
  minute: number;
} {
  return {
    type: schedule.type,

    every:
      schedule.type === "interval"
        ? schedule.every
        : 1,

    unit:
      schedule.type === "interval"
        ? schedule.unit
        : "days",

    dayOfMonth:
      schedule.type === "monthly"
        ? schedule.dayOfMonth
        : 1,

    hour:
      schedule.type === "daily" ||
      schedule.type === "monthly"
        ? schedule.hour
        : 9,

    minute:
      schedule.type === "daily" ||
      schedule.type === "monthly"
        ? schedule.minute
        : 0,
  };
}

function MonitorTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="מעקב ובקרה"
      className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
    >
      {monitorTabs.map((tab) => {
        const active =
          tab.href === "/MagicTouch/Monitor"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition",
              active
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100",
            ].join(" ")}
          >
            <span aria-hidden="true">
              {tab.icon}
            </span>

            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function MagicTouchJobsPage() {
  const { user, isLoading } = useAuth() as any;

  const { canAccess, isChecking } = usePermission(
    user
      ? "access_magic_touch_jobs_admin"
      : null
  );

  const [jobs, setJobs] = useState<Job[]>([]);
  const [recentRuns, setRecentRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingJobId, setSavingJobId] = useState("");
  const [runningJobId, setRunningJobId] = useState("");
  const [editingJobId, setEditingJobId] = useState("");

  const [editor, setEditor] = useState({
    type: "manual" as Schedule["type"],
    every: 1,
    unit: "days" as "hours" | "days",
    dayOfMonth: 1,
    hour: 9,
    minute: 0,
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const fn = httpsCallable<
        Record<string, never>,
        ListResult
      >(
        functions,
        "listMagicTouchJobs"
      );

      const response = await fn({});

      setJobs(response.data.jobs || []);
      setRecentRuns(
        response.data.recentRuns || []
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (
      !isLoading &&
      !isChecking &&
      canAccess
    ) {
      void load();
    }
  }, [
    isLoading,
    isChecking,
    canAccess,
    load,
  ]);

  const beginEdit = (job: Job) => {
    setEditingJobId(job.id);
    setEditor(
      defaultEditorSchedule(job.schedule)
    );
    setError("");
    setSuccess("");
  };

  const buildSchedule = (): Schedule => {
    if (editor.type === "interval") {
      return {
        type: "interval",
        every: Math.max(
          1,
          Number(editor.every) || 1
        ),
        unit: editor.unit,
        timeZone: TIME_ZONE,
      };
    }

    if (editor.type === "daily") {
      return {
        type: "daily",
        hour: Math.min(
          23,
          Math.max(
            0,
            Number(editor.hour) || 0
          )
        ),
        minute: Math.min(
          59,
          Math.max(
            0,
            Number(editor.minute) || 0
          )
        ),
        timeZone: TIME_ZONE,
      };
    }

    if (editor.type === "monthly") {
      return {
        type: "monthly",
        dayOfMonth: Math.min(
          31,
          Math.max(
            1,
            Number(editor.dayOfMonth) || 1
          )
        ),
        hour: Math.min(
          23,
          Math.max(
            0,
            Number(editor.hour) || 0
          )
        ),
        minute: Math.min(
          59,
          Math.max(
            0,
            Number(editor.minute) || 0
          )
        ),
        timeZone: TIME_ZONE,
      };
    }

    return {
      type: "manual",
      timeZone: TIME_ZONE,
    };
  };

  const saveJob = async (
    job: Job,
    enabled: boolean = job.enabled
  ) => {
    setSavingJobId(job.id);
    setError("");
    setSuccess("");

    try {
      const fn = httpsCallable<
        {
          jobId: string;
          enabled: boolean;
          schedule: Schedule;
        },
        {
          ok: boolean;
        }
      >(
        functions,
        "updateMagicTouchJob"
      );

      await fn({
        jobId: job.id,
        enabled,
        schedule:
          editingJobId === job.id
            ? buildSchedule()
            : job.schedule,
      });

      setSuccess(
        "הגדרת העיבוד נשמרה."
      );
      setEditingJobId("");
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSavingJobId("");
    }
  };

  const runNow = async (job: Job) => {
    const approved = window.confirm(
      `להריץ עכשיו את "${job.name}"?`
    );

    if (!approved) {
      return;
    }

    setRunningJobId(job.id);
    setError("");
    setSuccess("");

    try {
      const fn = httpsCallable<
        {
          jobId: string;
        },
        {
          ok: boolean;
          summary?: Record<string, unknown>;
        }
      >(
        functions,
        "runMagicTouchJobNow"
      );

      await fn({
        jobId: job.id,
      });

      setSuccess(
        "העיבוד הסתיים בהצלחה."
      );

      await load();
    } catch (runError) {
      setError(errorMessage(runError));
    } finally {
      setRunningJobId("");
    }
  };

  const summaryText = useCallback(
    (
      summary:
        | Record<string, unknown>
        | null
        | undefined
    ): string => {
      if (!summary) {
        return "-";
      }

      const keys = [
        "scanned",
        "processed",
        "signed",
        "partiallySigned",
        "waiting",
        "remindersDue",
        "failed",
      ];

      const labels: Record<string, string> = {
        scanned: "נסרקו",
        processed: "עובדו",
        signed: "חתומים",
        partiallySigned: "חלקיים",
        waiting: "ממתינים",
        remindersDue: "דורשי תזכורת",
        failed: "נכשלו",
      };

      return (
        keys
          .filter(
            (key) =>
              summary[key] !== undefined
          )
          .map(
            (key) =>
              `${labels[key]}: ${String(
                summary[key]
              )}`
          )
          .join(" · ") ||
        JSON.stringify(summary)
      );
    },
    []
  );

  const enabledCount = useMemo(
    () =>
      jobs.filter((job) => job.enabled)
        .length,
    [jobs]
  );

  if (isLoading || isChecking) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-7xl p-6"
      >
        טוען ניהול עיבודים...
      </main>
    );
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 px-4 py-6 text-right sm:px-6"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <MonitorTabs />

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-blue-600">
              MagicTouch · מעקב ובקרה
            </div>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              ניהול עיבודים
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              הפעלה ידנית, תזמון ומעקב אחר
              עיבודי המערכת. המסך זמין רק
              למשתמשים בעלי הרשאת ניהול
              עיבודים.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-400">
              עיבודים פעילים
            </div>

            <div className="mt-1 text-3xl font-bold text-slate-900">
              {enabledCount}
            </div>
          </div>
        </header>

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
          <section className="space-y-5">
            {jobs.map((job) => (
              <article
                key={job.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">
                        {job.name}
                      </h2>

                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-bold",
                          job.enabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        {job.enabled
                          ? "פעיל"
                          : "מושבת"}
                      </span>

                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-bold",
                          statusClass(
                            job.lastRunStatus
                          ),
                        ].join(" ")}
                      >
                        {job.lastRunStatus ||
                          "טרם רץ"}
                      </span>
                    </div>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {job.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      disabled={
                        runningJobId === job.id
                      }
                      onClick={() =>
                        void runNow(job)
                      }
                    >
                      {runningJobId === job.id
                        ? "מריץ..."
                        : "הרץ עכשיו"}
                    </button>

                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      onClick={() =>
                        beginEdit(job)
                      }
                    >
                      עריכת תזמון
                    </button>

                    <button
                      type="button"
                      className={[
                        "rounded-xl px-4 py-2 text-sm font-bold",
                        job.enabled
                          ? "border border-red-200 bg-red-50 text-red-700"
                          : "border border-emerald-200 bg-emerald-50 text-emerald-700",
                      ].join(" ")}
                      disabled={
                        savingJobId === job.id
                      }
                      onClick={() =>
                        void saveJob(
                          job,
                          !job.enabled
                        )
                      }
                    >
                      {job.enabled
                        ? "השבתה"
                        : "הפעלה"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <Info
                    label="תזמון"
                    value={scheduleText(
                      job.schedule
                    )}
                  />

                  <Info
                    label="ריצה אחרונה"
                    value={formatDate(
                      job.lastRunAt
                    )}
                  />

                  <Info
                    label="ריצה הבאה"
                    value={formatDate(
                      job.nextRunAt
                    )}
                  />

                  <Info
                    label="תוצאה אחרונה"
                    value={summaryText(
                      job.lastRunSummary
                    )}
                  />
                </div>

                {job.lastRunError ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {job.lastRunError}
                  </div>
                ) : null}

                {editingJobId === job.id ? (
                  <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <div className="grid gap-4 md:grid-cols-5">
                      <label className="block">
                        <span className="mb-2 block text-sm font-bold text-slate-700">
                          סוג תזמון
                        </span>

                        <select
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                          value={editor.type}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              type:
                                event.target
                                  .value as Schedule["type"],
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
                            value={editor.every}
                            min={1}
                            max={365}
                            onChange={(every) =>
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
                              value={editor.unit}
                              onChange={(event) =>
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
                          min={1}
                          max={31}
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
                            value={editor.hour}
                            min={0}
                            max={23}
                            onChange={(hour) =>
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
                            min={0}
                            max={59}
                            onChange={(minute) =>
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
                          void saveJob(job)
                        }
                      >
                        {savingJobId === job.id
                          ? "שומר..."
                          : "שמירת תזמון"}
                      </button>

                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-700"
                        onClick={() =>
                          setEditingJobId("")
                        }
                      >
                        ביטול
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            ריצות אחרונות
          </h2>

          {recentRuns.length === 0 ? (
            <div className="mt-4 text-sm text-slate-500">
              עדיין אין ריצות.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-right">
                      עיבוד
                    </th>

                    <th className="px-4 py-3 text-right">
                      מקור
                    </th>

                    <th className="px-4 py-3 text-right">
                      התחלה
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
                  {recentRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {run.jobName}
                      </td>

                      <td className="px-4 py-3 text-slate-600">
                        {run.source === "manual"
                          ? "ידני"
                          : "מתוזמן"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDate(
                          run.startedAt
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={[
                            "rounded-full px-3 py-1 text-xs font-bold",
                            statusClass(
                              run.status
                            ),
                          ].join(" ")}
                        >
                          {run.status}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-600">
                        {run.error ||
                          summaryText(
                            run.summary
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
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
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </span>

      <input
        type="number"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
        value={value}
        min={min}
        max={max}
        onChange={(event) =>
          onChange(
            Number(event.target.value)
          )
        }
      />
    </label>
  );
}
