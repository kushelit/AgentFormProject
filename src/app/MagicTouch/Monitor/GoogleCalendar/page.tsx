"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  doc,
  onSnapshot,
} from "firebase/firestore";

import {
  httpsCallable,
} from "firebase/functions";

import {
  db,
  functions,
} from "@/lib/firebase/firebase";

import {
  useAuth,
} from "@/lib/firebase/AuthContext";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import {
  usePermission,
} from "@/hooks/usePermission";

import {
  Button,
} from "@/components/Button/Button";

import DialogNotification from
  "@/components/DialogNotification";

import AccessDenied from
  "@/components/AccessDenied";

import MonitorTabs from
  "@/components/MagicTouch/Monitor/MonitorTabs";

type DialogKind =
  | "info"
  | "warning"
  | "success"
  | "error";

type DialogState = {
  type:
    DialogKind;

  title:
    string;

  message:
    string;
};

type TimestampLike = {
  toDate?: () => Date;
};

type GoogleCalendarConfig = {
  connected?:
    boolean;

  status?:
    string;

  googleAccount?:
    string |
    null;

  selectedCalendarId?:
    string |
    null;

  selectedCalendarName?:
    string |
    null;

  defaultBookingUrl?:
    string |
    null;

  lastSyncAt?:
    TimestampLike |
    null;

  lastSyncStatus?:
    string |
    null;

  lastSyncError?:
    string |
    null;

  lastSyncEventCount?:
    number |
    null;

  lastSyncCancelledCount?:
    number |
    null;

  lastSyncCustomerCandidateCount?:
    number |
    null;
};

type GoogleAppointment = {
  id:
    string;

  googleEventId:
    string;

  summary:
    string |
    null;

  status:
    string |
    null;

  customerNameCandidate:
    string |
    null;

  customerEmailCandidate:
    string |
    null;

  customerMatchStatus:
    string |
    null;

  contactId:
    string |
    null;

  startAt:
    string |
    null;

  endAt:
    string |
    null;

  organizerEmail:
    string |
    null;

  attendees:
    unknown[];
};

function s(
  value:
    unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function formatTimestamp(
  value?:
    TimestampLike |
    null
): string {
  if (
    !value ||
    typeof value.toDate !==
      "function"
  ) {
    return "-";
  }

  return value
    .toDate()
    .toLocaleString(
      "he-IL"
    );
}

function formatDate(
  value:
    string |
    null |
    undefined
): string {
  const raw =
    s(
      value
    );

  if (
    !raw
  ) {
    return "-";
  }

  const date =
    new Date(
      raw
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return raw;
  }

  return date
    .toLocaleString(
      "he-IL"
    );
}

function StatCard({
  label,
  value,
  description,
}: {
  label:
    string;

  value:
    string;

  description?:
    string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-bold text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </div>

      {description ? (
        <div className="mt-1 text-xs text-slate-400">
          {description}
        </div>
      ) : null}
    </div>
  );
}

export default function GoogleCalendarMonitorPage() {
  const {
    user,
    isLoading,
  } =
    useAuth() as any;

  const {
    effectiveAgentId:
      agentId,

    selectedAgentName,
  } =
    useMagicTouchAgent();

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
    config,
    setConfig,
  ] =
    useState<GoogleCalendarConfig | null>(
      null
    );

  const [
    appointments,
    setAppointments,
  ] =
    useState<GoogleAppointment[]>(
      []
    );

  const [
    loadingConfig,
    setLoadingConfig,
  ] =
    useState(
      false
    );

  const [
    loadingAppointments,
    setLoadingAppointments,
  ] =
    useState(
      false
    );

  const [
    syncing,
    setSyncing,
  ] =
    useState(
      false
    );

  const [
    dialog,
    setDialog,
  ] =
    useState<DialogState | null>(
      null
    );

  useEffect(
    () => {
      setAppointments(
        []
      );

      if (
        !agentId
      ) {
        setConfig(
          null
        );

        setLoadingConfig(
          false
        );

        return;
      }

      setLoadingConfig(
        true
      );

      const configRef =
        doc(
          db,
          `agents/${agentId}/config/googleCalendar`
        );

      return onSnapshot(
        configRef,

        (
          snapshot
        ) => {
          if (
            !snapshot.exists()
          ) {
            setConfig(
              null
            );

            setLoadingConfig(
              false
            );

            return;
          }

          const data =
            snapshot.data();

          setConfig({
            connected:
              data.connected ===
              true,

            status:
              s(
                data.status
              ),

            googleAccount:
              s(
                data.googleAccount
              ) ||
              null,

            selectedCalendarId:
              s(
                data.selectedCalendarId
              ) ||
              null,

            selectedCalendarName:
              s(
                data.selectedCalendarName
              ) ||
              null,

            defaultBookingUrl:
              s(
                data.defaultBookingUrl
              ) ||
              null,

            lastSyncAt:
              data.lastSyncAt ||
              null,

            lastSyncStatus:
              s(
                data.lastSyncStatus
              ) ||
              null,

            lastSyncError:
              s(
                data.lastSyncError
              ) ||
              null,

            lastSyncEventCount:
              typeof data.lastSyncEventCount ===
              "number"
                ? data.lastSyncEventCount
                : null,

            lastSyncCancelledCount:
              typeof data.lastSyncCancelledCount ===
              "number"
                ? data.lastSyncCancelledCount
                : null,

            lastSyncCustomerCandidateCount:
              typeof data.lastSyncCustomerCandidateCount ===
              "number"
                ? data.lastSyncCustomerCandidateCount
                : null,
          });

          setLoadingConfig(
            false
          );
        },

        (
          error
        ) => {
          console.error(
            "[Google Calendar Monitor] config listener failed",
            error
          );

          setLoadingConfig(
            false
          );

          setDialog({
            type:
              "error",

            title:
              "שגיאה",

            message:
              "לא ניתן לטעון את הגדרות Google Calendar.",
          });
        }
      );
    },

    [
      agentId,
    ]
  );

  useEffect(
    () => {
      if (
        !agentId
      ) {
        setAppointments(
          []
        );

        return;
      }

      setLoadingAppointments(
        true
      );

      const appointmentsRef =
        collection(
          db,
          `agents/${agentId}/booking_appointments`
        );

      return onSnapshot(
        appointmentsRef,

        (
          snapshot
        ) => {
          const rows =
            snapshot.docs
              .map(
                (
                  snap
                ) => {
                  const data =
                    snap.data() as any;

                  /*
                   * booking_appointments משותף
                   * גם ל-Microsoft.
                   * במסך הזה מציגים רק Google.
                   */
                  if (
                    s(
                      data.bookingProvider
                    ) !==
                    "google" &&
                    s(
                      data.provider
                    ) !==
                    "google_calendar"
                  ) {
                    return null;
                  }

                  const organizer =
                    data.organizer &&
                    typeof data.organizer ===
                      "object"
                      ? data.organizer
                      : {};

                  return {
                    id:
                      snap.id,

                    googleEventId:
                      s(
                        data.googleEventId ||
                        snap.id
                      ),

                    summary:
                      s(
                        data.summary
                      ) ||
                      null,

                    status:
                      s(
                        data.status
                      ) ||
                      null,

                    customerNameCandidate:
                      s(
                        data.customerNameCandidate
                      ) ||
                      null,

                    customerEmailCandidate:
                      s(
                        data.customerEmailCandidate
                      ) ||
                      null,

                    customerMatchStatus:
                      s(
                        data.customerMatchStatus
                      ) ||
                      null,

                    contactId:
                      s(
                        data.contactId
                      ) ||
                      null,

                    startAt:
                      s(
                        data.startAt
                      ) ||
                      null,

                    endAt:
                      s(
                        data.endAt
                      ) ||
                      null,

                    organizerEmail:
                      s(
                        organizer.email
                      ) ||
                      null,

                    attendees:
                      Array.isArray(
                        data.attendees
                      )
                        ? data.attendees
                        : [],
                  } as GoogleAppointment;
                }
              )
              .filter(
                (
                  value
                ): value is GoogleAppointment =>
                  value !==
                  null
              );

          rows.sort(
            (
              a,
              b
            ) => {
              const aTime =
                new Date(
                  a.startAt ||
                  0
                ).getTime();

              const bTime =
                new Date(
                  b.startAt ||
                  0
                ).getTime();

              return (
                bTime -
                aTime
              );
            }
          );

          setAppointments(
            rows
          );

          setLoadingAppointments(
            false
          );
        },

        (
          error
        ) => {
          console.error(
            "[Google Calendar Monitor] appointments listener failed",
            error
          );

          setLoadingAppointments(
            false
          );

          setDialog({
            type:
              "error",

            title:
              "שגיאה",

            message:
              "לא ניתן לטעון את פגישות Google Calendar.",
          });
        }
      );
    },

    [
      agentId,
    ]
  );

  const matchedCount =
    useMemo(
      () =>
        appointments.filter(
          (
            appointment
          ) =>
            Boolean(
              appointment.contactId
            )
        ).length,
      [
        appointments,
      ]
    );

  const unmatchedCount =
    appointments.length -
    matchedCount;

  const handleSyncNow =
    async () => {
      if (
        !agentId
      ) {
        return;
      }

      setSyncing(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId:
                string;
            },
            {
              ok:
                boolean;

              syncedCount:
                number;

              cancelledCount:
                number;

              customerCandidateCount:
                number;
            }
          >(
            functions,
            "syncGoogleCalendarAppointments"
          );

        const response =
          await fn({
            agentId,
          });

        const data =
          response.data;

        setDialog({
          type:
            "success",

          title:
            "הסנכרון הסתיים",

          message:
            `נשמרו ${data.syncedCount ?? 0} אירועים. ` +
            `${data.cancelledCount ?? 0} מבוטלים. ` +
            `ב-${data.customerCandidateCount ?? 0} אירועים נמצאו פרטי לקוח אפשריים.`,
        });
      } catch (
        error:
          any
      ) {
        console.error(
          "[Google Calendar Monitor] sync failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "הסנכרון נכשל",

          message:
            error?.message ||
            "לא ניתן לסנכרן את Google Calendar.",
        });
      } finally {
        setSyncing(
          false
        );
      }
    };

  if (
    isLoading ||
    isChecking
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-7xl p-6"
      >
        טוען Google Calendar...
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
            MagicTouch · עיבודים
          </div>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Google Calendar
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            ניהול, בדיקה וסנכרון של פגישות Google Calendar
            עבור הסוכן שנבחר.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-slate-400">
                סוכן נבחר
              </div>

              <div className="mt-1 text-lg font-bold text-slate-900">
                {selectedAgentName ||
                  agentId ||
                  "לא נבחר סוכן"}
              </div>
            </div>

            {config?.connected ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-700">
                Google מחובר
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-600">
                Google לא מחובר
              </span>
            )}
          </div>
        </section>

        {!agentId ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="font-bold text-slate-800">
              לא נבחר סוכן
            </div>

            <div className="mt-2 text-sm text-slate-500">
              בחרי סוכן כדי להציג את נתוני Google Calendar שלו.
            </div>
          </section>
        ) : loadingConfig ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            טוען נתוני Google Calendar...
          </section>
        ) : !config?.connected ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-bold text-amber-900">
              הסוכן אינו מחובר ל-Google Calendar
            </h2>

            <p className="mt-2 text-sm text-amber-800">
              את החיבור עצמו יש לבצע במסך האינטגרציות של הסוכן.
              המסך הזה מיועד לתפעול ובקרה בלבד.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="סנכרון אחרון"
                value={
                  formatTimestamp(
                    config.lastSyncAt
                  )
                }
                description={
                  config.lastSyncStatus ===
                  "failed"
                    ? "הסנכרון האחרון נכשל"
                    : "מועד ההרצה האחרונה"
                }
              />

              <StatCard
                label="אירועים בסנכרון האחרון"
                value={
                  config.lastSyncEventCount !=
                  null
                    ? String(
                        config.lastSyncEventCount
                      )
                    : "-"
                }
              />

              <StatCard
                label="פרטי לקוח שזוהו"
                value={
                  config.lastSyncCustomerCandidateCount !=
                  null
                    ? String(
                        config.lastSyncCustomerCandidateCount
                      )
                    : "-"
                }
              />

              <StatCard
                label="ביטולים"
                value={
                  config.lastSyncCancelledCount !=
                  null
                    ? String(
                        config.lastSyncCancelledCount
                      )
                    : "-"
                }
              />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <StatCard
                label="פגישות Google שנשמרו"
                value={
                  String(
                    appointments.length
                  )
                }
              />

              <StatCard
                label="שויכו לאיש קשר"
                value={
                  String(
                    matchedCount
                  )
                }
                description={
                  `${unmatchedCount} עדיין ללא התאמה`
                }
              />
            </section>

            {config.lastSyncError ? (
              <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <div className="font-bold">
                  שגיאת הסנכרון האחרונה
                </div>

                <div className="mt-1">
                  {
                    config.lastSyncError
                  }
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    פעולות
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    משיכת שינויים מ-Google Calendar
                    עבור הסוכן שנבחר.
                  </p>
                </div>

                <Button
                  text={
                    syncing
                      ? "מסנכרן..."
                      : "סנכרן סוכן נבחר"
                  }
                  onClick={
                    handleSyncNow
                  }
                  disabled={
                    syncing
                  }
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    פגישות Google
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    אירועים שנקלטו מהיומן של הסוכן ונשמרו ב-MagicTouch.
                  </p>
                </div>

                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">
                  {
                    appointments.length
                  }{" "}
                  פגישות
                </span>
              </div>

              {loadingAppointments ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  טוען פגישות...
                </div>
              ) : appointments.length ===
                0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    עדיין לא נשמרו פגישות Google עבור הסוכן.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 text-right">
                            לקוח
                          </th>

                          <th className="px-4 py-3 text-right">
                            אימייל
                          </th>

                          <th className="px-4 py-3 text-right">
                            אירוע
                          </th>

                          <th className="px-4 py-3 text-right">
                            מועד
                          </th>

                          <th className="px-4 py-3 text-right">
                            מצב
                          </th>

                          <th className="px-4 py-3 text-right">
                            התאמה
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {appointments.map(
                          (
                            appointment
                          ) => {
                            const cancelled =
                              appointment.status ===
                              "cancelled";

                            const matched =
                              Boolean(
                                appointment.contactId
                              );

                            return (
                              <tr
                                key={
                                  appointment.id
                                }
                                className="align-top hover:bg-slate-50"
                              >
                                <td className="px-4 py-4">
                                  <div className="font-bold text-slate-900">
                                    {appointment.customerNameCandidate ||
                                      "-"}
                                  </div>

                                  <div
                                    dir="ltr"
                                    className="mt-1 max-w-52 truncate text-right font-mono text-[10px] text-slate-400"
                                    title={
                                      appointment.googleEventId
                                    }
                                  >
                                    {
                                      appointment.googleEventId
                                    }
                                  </div>
                                </td>

                                <td
                                  dir="ltr"
                                  className="px-4 py-4 text-right text-slate-600"
                                >
                                  {appointment.customerEmailCandidate ||
                                    "-"}
                                </td>

                                <td className="px-4 py-4 text-slate-700">
                                  {appointment.summary ||
                                    "-"}
                                </td>

                                <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                                  {formatDate(
                                    appointment.startAt
                                  )}
                                </td>

                                <td className="px-4 py-4">
                                  <span
                                    className={[
                                      "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",

                                      cancelled
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-emerald-100 text-emerald-700",
                                    ].join(
                                      " "
                                    )}
                                  >
                                    {cancelled
                                      ? "מבוטלת"
                                      : "פעילה"}
                                  </span>
                                </td>

                                <td className="px-4 py-4">
                                  <span
                                    className={[
                                      "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",

                                      matched
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-amber-100 text-amber-800",
                                    ].join(
                                      " "
                                    )}
                                  >
                                    {matched
                                      ? "שויכה"
                                      : "ללא התאמה"}
                                  </span>
                                </td>
                              </tr>
                            );
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
            </section>
          </>
        )}

        {dialog ? (
          <DialogNotification
            type={
              dialog.type
            }
            title={
              dialog.title
            }
            message={
              dialog.message
            }
            onConfirm={() =>
              setDialog(
                null
              )
            }
            onCancel={() =>
              setDialog(
                null
              )
            }
            confirmText="אישור"
            hideCancel
          />
        ) : null}
      </div>
    </main>
  );
}