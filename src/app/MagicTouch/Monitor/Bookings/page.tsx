"use client";

import React, {
  useEffect,
  useState,
} from "react";

import {
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

import DialogNotification from "@/components/DialogNotification";
import AccessDenied from "@/components/AccessDenied";

import MonitorTabs from "@/components/MagicTouch/Monitor/MonitorTabs";

type DialogKind =
  | "info"
  | "warning"
  | "success"
  | "error";


type DialogState = {
  type: DialogKind;
  title: string;
  message: string;
};


type TimestampLike = {
  toDate?: () => Date;
};


type MicrosoftBookingsConfig = {
  status?: string;
  connected?: boolean;

  microsoftUserName?: string | null;
  microsoftUserEmail?: string | null;

  bookingBusinessId?: string | null;
  bookingBusinessName?: string | null;

  lastSyncAt?: TimestampLike | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;

  lastSyncAppointmentCount?: number | null;
  lastSyncMatchedCount?: number | null;
  lastSyncUnmatchedCount?: number | null;
  lastSyncCancelledCount?: number | null;
  lastSyncCreatedEventCount?: number | null;
  lastSyncCancelledEventCount?: number | null;
};


type MicrosoftAppointmentListItem = {
  appointmentId: string;

  selfServiceAppointmentId?: string | null;

  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;

  serviceId?: string | null;
  serviceName?: string | null;

  startAt?:
    | {
        dateTime?: string;
        timeZone?: string;
      }
    | string
    | null;

  endAt?:
    | {
        dateTime?: string;
        timeZone?: string;
      }
    | string
    | null;

  isCancelled?: boolean;

  createdDateTime?: string | null;
  lastUpdatedDateTime?: string | null;
};


type MicrosoftAppointmentListResult = {
  ok: boolean;

  agentId?: string;

  bookingBusinessId: string;

  start: string;
  end: string;

  count: number;

  appointments:
    MicrosoftAppointmentListItem[];
};


function formatTimestamp(
  value?:
    | TimestampLike
    | null
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


function appointmentDateText(
  value:
    | {
        dateTime?: string;
        timeZone?: string;
      }
    | string
    | null
    | undefined
): string {
  const raw =
    typeof value ===
    "string"
      ? value
      : String(
          value?.dateTime ||
            ""
        );

  if (!raw) {
    return "-";
  }

  const date =
    new Date(raw);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return raw;
  }

  return date.toLocaleString(
    "he-IL"
  );
}


function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-bold text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </div>

      {description && (
        <div className="mt-1 text-xs text-slate-400">
          {description}
        </div>
      )}
    </div>
  );
}


export default function MicrosoftBookingsAdminPage() {
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
    useState<MicrosoftBookingsConfig | null>(
      null
    );


  const [
    loadingConfig,
    setLoadingConfig,
  ] =
    useState(false);


  const [
    syncing,
    setSyncing,
  ] =
    useState(false);


  const [
    listingAppointments,
    setListingAppointments,
  ] =
    useState(false);


  const [
    appointmentListResult,
    setAppointmentListResult,
  ] =
    useState<MicrosoftAppointmentListResult | null>(
      null
    );


  const [
    deletingAppointmentId,
    setDeletingAppointmentId,
  ] =
    useState("");


  const [
    diagnosingAppointmentId,
    setDiagnosingAppointmentId,
  ] =
    useState("");


  const [
    diagnosticResult,
    setDiagnosticResult,
  ] =
    useState<Record<
      string,
      any
    > | null>(
      null
    );


  const [
    diagnosticTitle,
    setDiagnosticTitle,
  ] =
    useState("");


  const [
    dialog,
    setDialog,
  ] =
    useState<DialogState | null>(
      null
    );


  useEffect(
    () => {
      setAppointmentListResult(
        null
      );

      setDiagnosticResult(
        null
      );

      setDiagnosticTitle(
        ""
      );

      if (!agentId) {
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
          `agents/${agentId}/config/microsoftBookings`
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
            status:
              String(
                data.status ||
                  ""
              ),

            connected:
              data.connected ===
              true,

            microsoftUserName:
              data.microsoftUserName ||
              null,

            microsoftUserEmail:
              data.microsoftUserEmail ||
              null,

            bookingBusinessId:
              data.bookingBusinessId ||
              null,

            bookingBusinessName:
              data.bookingBusinessName ||
              null,

            lastSyncAt:
              data.lastSyncAt ||
              null,

            lastSyncStatus:
              data.lastSyncStatus ||
              null,

            lastSyncError:
              data.lastSyncError ||
              null,

            lastSyncAppointmentCount:
              typeof data.lastSyncAppointmentCount ===
              "number"
                ? data.lastSyncAppointmentCount
                : null,

            lastSyncMatchedCount:
              typeof data.lastSyncMatchedCount ===
              "number"
                ? data.lastSyncMatchedCount
                : null,

            lastSyncUnmatchedCount:
              typeof data.lastSyncUnmatchedCount ===
              "number"
                ? data.lastSyncUnmatchedCount
                : null,

            lastSyncCancelledCount:
              typeof data.lastSyncCancelledCount ===
              "number"
                ? data.lastSyncCancelledCount
                : null,

            lastSyncCreatedEventCount:
              typeof data.lastSyncCreatedEventCount ===
              "number"
                ? data.lastSyncCreatedEventCount
                : null,

            lastSyncCancelledEventCount:
              typeof data.lastSyncCancelledEventCount ===
              "number"
                ? data.lastSyncCancelledEventCount
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
            "[Bookings Admin] config listener failed",
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
              "לא ניתן לטעון את הגדרות Microsoft Bookings.",
          });
        }
      );
    },

    [
      agentId,
    ]
  );


  const handleSyncNow =
    async () => {
      if (!agentId) {
        return;
      }

      setSyncing(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
            },
            {
              ok?: boolean;
              appointments?: number;
              matched?: number;
              unmatched?: number;
              createdEvents?: number;
              cancelledEvents?: number;
            }
          >(
            functions,
            "syncMicrosoftBookingsNow"
          );

        const result =
          await fn({
            agentId,
          });

        const data =
          result.data;

        setDialog({
          type:
            "success",

          title:
            "הסנכרון הסתיים",

          message:
            `נמצאו ${data.appointments ?? 0} פגישות. ` +
            `${data.matched ?? 0} שויכו לאנשי קשר, ` +
            `${data.unmatched ?? 0} לא שויכו. ` +
            `${data.createdEvents ?? 0} אירועי פגישה חדשים ו-` +
            `${data.cancelledEvents ?? 0} אירועי ביטול נוצרו.`,
        });
      } catch (
        error: any
      ) {
        console.error(
          "[Bookings Admin] sync failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "הסנכרון נכשל",

          message:
            error?.message ||
            "לא ניתן לסנכרן את פגישות Microsoft Bookings.",
        });
      } finally {
        setSyncing(
          false
        );
      }
    };


  const handleListAppointments =
    async () => {
      if (!agentId) {
        return;
      }

      setListingAppointments(
        true
      );

      setAppointmentListResult(
        null
      );

      setDiagnosticResult(
        null
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
            },
            MicrosoftAppointmentListResult
          >(
            functions,
            "listMicrosoftBookingsAppointments"
          );

        const response =
          await fn({
            agentId,
          });

        setAppointmentListResult(
          response.data
        );
      } catch (
        error: any
      ) {
        console.error(
          "[Bookings Admin] appointment list failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "טעינת הפגישות נכשלה",

          message:
            error?.message ||
            "לא ניתן לטעון את רשימת הפגישות מ-Microsoft.",
        });
      } finally {
        setListingAppointments(
          false
        );
      }
    };


  const handleDiagnoseAppointment =
    async (
      appointment:
        MicrosoftAppointmentListItem
    ) => {
      if (
        !agentId ||
        !appointment.appointmentId
      ) {
        return;
      }

      setDiagnosingAppointmentId(
        appointment.appointmentId
      );

      setDiagnosticResult(
        null
      );

      setDiagnosticTitle(
        appointment.customerName ||
          appointment.appointmentId
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
              appointmentId: string;
            },
            Record<
              string,
              any
            >
          >(
            functions,
            "diagnoseMicrosoftBookingAppointment"
          );

        const response =
          await fn({
            agentId,

            appointmentId:
              appointment.appointmentId,
          });

        setDiagnosticResult(
          response.data
        );
      } catch (
        error: any
      ) {
        console.error(
          "[Bookings Admin] diagnostic failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "בדיקת הפגישה נכשלה",

          message:
            error?.message ||
            "לא ניתן לבדוק את הפגישה מול Microsoft.",
        });
      } finally {
        setDiagnosingAppointmentId(
          ""
        );
      }
    };


  const handleDeleteAppointment =
    async (
      appointment:
        MicrosoftAppointmentListItem
    ) => {
      if (!agentId) {
        return;
      }

      const approved =
        window.confirm(
          `למחוק את הפגישה של ${
            appointment.customerName ||
            "הלקוח"
          } מ-Microsoft Bookings?`
        );

      if (!approved) {
        return;
      }

      const confirmation =
        window.prompt(
          "כדי לאשר את המחיקה הקלידי DELETE"
        );

      if (
        confirmation !==
        "DELETE"
      ) {
        setDialog({
          type:
            "warning",

          title:
            "המחיקה בוטלה",

          message:
            "לא הוקלד אישור DELETE.",
        });

        return;
      }

      setDeletingAppointmentId(
        appointment.appointmentId
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
              appointmentId: string;
              confirmation: "DELETE";
            },
            {
              ok: boolean;
              deleted: boolean;
              httpStatus: number;
            }
          >(
            functions,
            "deleteMicrosoftBookingAppointment"
          );

        await fn({
          agentId,

          appointmentId:
            appointment.appointmentId,

          confirmation:
            "DELETE",
        });

        setAppointmentListResult(
          (
            current
          ) => {
            if (
              !current
            ) {
              return current;
            }

            const appointments =
              current.appointments.filter(
                (
                  item
                ) =>
                  item.appointmentId !==
                  appointment.appointmentId
              );

            return {
              ...current,

              count:
                appointments.length,

              appointments,
            };
          }
        );

        if (
          diagnosticTitle &&
          diagnosticResult
        ) {
          setDiagnosticResult(
            null
          );

          setDiagnosticTitle(
            ""
          );
        }

        setDialog({
          type:
            "success",

          title:
            "הפגישה נמחקה",

          message:
            "הפגישה נמחקה מ-Microsoft Bookings.",
        });
      } catch (
        error: any
      ) {
        console.error(
          "[Bookings Admin] delete failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "מחיקת הפגישה נכשלה",

          message:
            error?.message ||
            "לא ניתן למחוק את הפגישה מ-Microsoft.",
        });
      } finally {
        setDeletingAppointmentId(
          ""
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
        טוען Microsoft Bookings...
      </main>
    );
  }


  if (!canAccess) {
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
            Microsoft Bookings
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            ניהול, בדיקה וסנכרון של פגישות Microsoft Bookings
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
                Microsoft מחובר
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-600">
                Microsoft לא מחובר
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
              בחרי סוכן כדי להציג את נתוני Microsoft Bookings שלו.
            </div>
          </section>
        ) : loadingConfig ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            טוען נתוני Bookings...
          </section>
        ) : !config?.connected ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-bold text-amber-900">
              הסוכן אינו מחובר ל-Microsoft Bookings
            </h2>

            <p className="mt-2 text-sm text-amber-800">
              את החיבור עצמו יש לבצע במסך החיבורים של הסוכן.
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
                label="פגישות שנמצאו"
                value={
                  config.lastSyncAppointmentCount !=
                  null
                    ? String(
                        config.lastSyncAppointmentCount
                      )
                    : "-"
                }
              />

              <StatCard
                label="שויכו לאנשי קשר"
                value={
                  config.lastSyncMatchedCount !=
                  null
                    ? String(
                        config.lastSyncMatchedCount
                      )
                    : "-"
                }
              />

              <StatCard
                label="ללא התאמה"
                value={
                  config.lastSyncUnmatchedCount !=
                  null
                    ? String(
                        config.lastSyncUnmatchedCount
                      )
                    : "-"
                }
              />
            </section>


            {config.lastSyncError && (
              <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <div className="font-bold">
                  שגיאת הסנכרון האחרונה
                </div>

                <div className="mt-1">
                  {config.lastSyncError}
                </div>
              </section>
            )}


            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    פעולות
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    הפעלה ידנית של כלי הסנכרון והבדיקה.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    text={
                      syncing
                        ? "מסנכרן..."
                        : "סנכרן עכשיו"
                    }
                    onClick={
                      handleSyncNow
                    }
                    disabled={
                      syncing
                    }
                  />

                  <Button
                    text={
                      listingAppointments
                        ? "טוען פגישות..."
                        : "טען פגישות מ-Microsoft"
                    }
                    onClick={
                      handleListAppointments
                    }
                    disabled={
                      listingAppointments
                    }
                  />
                </div>
              </div>
            </section>


            {appointmentListResult && (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      פגישות Microsoft
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      פגישות שהוחזרו ישירות מ־Microsoft בחלון הסנכרון.
                    </p>
                  </div>

                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">
                    {appointmentListResult.count} פגישות
                  </span>
                </div>


                {appointmentListResult.appointments.length ===
                0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    Microsoft לא החזירה פגישות בחלון הסנכרון.
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
                            פרטי קשר
                          </th>

                          <th className="px-4 py-3 text-right">
                            שירות
                          </th>

                          <th className="px-4 py-3 text-right">
                            מועד
                          </th>

                          <th className="px-4 py-3 text-right">
                            מצב
                          </th>

                          <th className="px-4 py-3 text-right">
                            פעולות
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {appointmentListResult.appointments.map(
                          (
                            appointment
                          ) => (
                            <tr
                              key={
                                appointment.appointmentId
                              }
                              className="align-top hover:bg-slate-50"
                            >
                              <td className="px-4 py-4">
                                <div className="font-bold text-slate-900">
                                  {appointment.customerName ||
                                    "-"}
                                </div>

                                <div
                                  dir="ltr"
                                  className="mt-1 max-w-52 truncate text-right font-mono text-[10px] text-slate-400"
                                  title={
                                    appointment.appointmentId
                                  }
                                >
                                  {appointment.appointmentId}
                                </div>
                              </td>

                              <td className="px-4 py-4 text-slate-600">
                                <div dir="ltr">
                                  {appointment.customerPhone ||
                                    "-"}
                                </div>

                                <div
                                  dir="ltr"
                                  className="mt-1 text-xs"
                                >
                                  {appointment.customerEmail ||
                                    "-"}
                                </div>
                              </td>

                              <td className="px-4 py-4 text-slate-700">
                                {appointment.serviceName ||
                                  "-"}
                              </td>

                              <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                                {appointmentDateText(
                                  appointment.startAt
                                )}
                              </td>

                              <td className="px-4 py-4">
                                <span
                                  className={[
                                    "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",

                                    appointment.isCancelled
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-emerald-100 text-emerald-700",
                                  ].join(
                                    " "
                                  )}
                                >
                                  {appointment.isCancelled
                                    ? "מבוטלת"
                                    : "פעילה"}
                                </span>
                              </td>

                              <td className="px-4 py-4">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                    onClick={() =>
                                      void handleDiagnoseAppointment(
                                        appointment
                                      )
                                    }
                                    disabled={
                                      diagnosingAppointmentId ===
                                      appointment.appointmentId
                                    }
                                  >
                                    {diagnosingAppointmentId ===
                                    appointment.appointmentId
                                      ? "בודק..."
                                      : "בדיקה"}
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                    onClick={() =>
                                      void handleDeleteAppointment(
                                        appointment
                                      )
                                    }
                                    disabled={
                                      deletingAppointmentId ===
                                      appointment.appointmentId
                                    }
                                  >
                                    {deletingAppointmentId ===
                                    appointment.appointmentId
                                      ? "מוחק..."
                                      : "מחיקה"}
                                  </button>
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
            )}


            {diagnosticResult && (
              <section className="rounded-2xl border border-purple-200 bg-purple-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-purple-600">
                      כלי בדיקה
                    </div>

                    <h2 className="mt-1 text-lg font-bold text-purple-950">
                      בדיקת פגישה – {diagnosticTitle}
                    </h2>
                  </div>

                  <button
                    type="button"
                    className="text-sm font-bold text-purple-700"
                    onClick={() => {
                      setDiagnosticResult(
                        null
                      );

                      setDiagnosticTitle(
                        ""
                      );
                    }}
                  >
                    סגור
                  </button>
                </div>


                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <StatCard
                    label="Calendar View"
                    value={
                      diagnosticResult
                        ?.calendarView
                        ?.found
                        ? "נמצאה"
                        : "לא נמצאה"
                    }
                  />

                  <StatCard
                    label="Appointments List"
                    value={
                      diagnosticResult
                        ?.appointmentsList
                        ?.found
                        ? "נמצאה"
                        : "לא נמצאה"
                    }
                  />

                  <StatCard
                    label="Direct Lookup"
                    value={
                      diagnosticResult
                        ?.directLookup
                        ?.found
                        ? `נמצאה · HTTP ${
                            diagnosticResult
                              ?.directLookup
                              ?.status ??
                            "-"
                          }`
                        : `לא נמצאה · HTTP ${
                            diagnosticResult
                              ?.directLookup
                              ?.status ??
                            "-"
                          }`
                    }
                  />
                </div>


                <details className="mt-4 rounded-xl border border-purple-200 bg-white p-4">
                  <summary className="cursor-pointer font-bold text-purple-900">
                    הצגת התוצאה המלאה
                  </summary>

                  <pre
                    dir="ltr"
                    className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-left text-xs text-white"
                  >
                    {JSON.stringify(
                      diagnosticResult,
                      null,
                      2
                    )}
                  </pre>
                </details>
              </section>
            )}
          </>
        )}


        {dialog && (
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
        )}
      </div>
    </main>
  );
}