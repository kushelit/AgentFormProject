"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

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
  usePermission,
} from "@/hooks/usePermission";

import {
  Button,
} from "@/components/Button/Button";

import DialogNotification from "@/components/DialogNotification";
import AccessDenied from "@/components/AccessDenied";

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

type MicrosoftBusiness = {
  id: string;
  displayName: string;
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
  bookingBusinessEmail?: string | null;
  bookingBusinessPhone?: string | null;
  bookingBusinessPublicUrl?: string | null;

  availableBusinesses?: MicrosoftBusiness[];

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

const CONNECTION_STATUS_LABELS:
  Record<string, string> = {
    connected:
      "מחובר",

    needs_business_selection:
      "נדרשת בחירת עסק",

    no_booking_business:
      "לא נמצא עסק Bookings",

    disconnected:
      "לא מחובר",
  };

const SYNC_STATUS_LABELS:
  Record<string, string> = {
    not_started:
      "טרם בוצע סנכרון",

    success:
      "הסנכרון הצליח",

    failed:
      "הסנכרון נכשל",
  };

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

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="text-xs font-semibold text-gray-500">
        {label}
      </div>

      <div className="mt-1 break-words text-sm font-medium">
        {value}
      </div>
    </div>
  );
}

export default function MicrosoftBookingsSettings() {
  const searchParams =
    useSearchParams();

  const {
    user,
    detail,
    isLoading,
  } =
    useAuth() as any;

  const {
    canAccess,
    isChecking,
  } =
    usePermission(
      user
        ? "access_magic_touch"
        : null
    );

  const agentId =
    String(
      detail?.agentId ||
      user?.uid ||
      ""
    ).trim();

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
    useState(true);

  const [
    connecting,
    setConnecting,
  ] =
    useState(false);

  const [
    syncing,
    setSyncing,
  ] =
    useState(false);

  const [
    disconnecting,
    setDisconnecting,
  ] =
    useState(false);

  const [
    savingBusiness,
    setSavingBusiness,
  ] =
    useState(false);

  const [
    testingConnection,
    setTestingConnection,
  ] =
    useState(false);

  const [
    selectedBusinessId,
    setSelectedBusinessId,
  ] =
    useState("");

  const [
    dialog,
    setDialog,
  ] =
    useState<DialogState | null>(
      null
    );


const [
  diagnosticAppointmentId,
  setDiagnosticAppointmentId,
] = useState("");

const [
  diagnosingAppointment,
  setDiagnosingAppointment,
] = useState(false);

const [
  diagnosticResult,
  setDiagnosticResult,
] = useState<Record<string, any> | null>(
  null
);



  useEffect(
    () => {
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

            setSelectedBusinessId(
              ""
            );

            setLoadingConfig(
              false
            );

            return;
          }

          const data =
            snapshot.data();

          const availableBusinesses =
            Array.isArray(
              data.availableBusinesses
            )
              ? data.availableBusinesses.map(
                (
                  business:
                    Record<string, unknown>
                ) => ({
                  id:
                    String(
                      business.id ||
                      ""
                    ),

                  displayName:
                    String(
                      business.displayName ||
                      business.id ||
                      ""
                    ),
                })
              )
              : [];

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

            bookingBusinessEmail:
              data.bookingBusinessEmail ||
              null,

            bookingBusinessPhone:
              data.bookingBusinessPhone ||
              null,

            bookingBusinessPublicUrl:
              data.bookingBusinessPublicUrl ||
              null,

            availableBusinesses,

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

          setSelectedBusinessId(
            String(
              data.bookingBusinessId ||
              availableBusinesses[0]?.id ||
              ""
            )
          );

          setLoadingConfig(
            false
          );
        },
        (
          error
        ) => {
          console.error(
            "[MicrosoftBookingsSettings] config listener failed",
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

  useEffect(
    () => {
      const result =
        searchParams.get(
          "microsoftBookings"
        );

      if (
        !result
      ) {
        return;
      }

      if (
        result ===
        "connected"
      ) {
        setDialog({
          type:
            "success",

          title:
            "החיבור הושלם",

          message:
            "חשבון Microsoft Bookings חובר בהצלחה.",
        });

        return;
      }

      if (
        result ===
        "needs_business_selection"
      ) {
        setDialog({
          type:
            "warning",

          title:
            "נדרשת בחירת עסק",

          message:
            "החשבון חובר. כעת יש לבחור את עסק ה-Bookings.",
        });

        return;
      }

      if (
        result ===
        "no_booking_business"
      ) {
        setDialog({
          type:
            "warning",

          title:
            "לא נמצא Bookings",

          message:
            "החשבון חובר, אך לא נמצא עסק Microsoft Bookings פעיל.",
        });

        return;
      }

      if (
        result ===
        "error"
      ) {
        setDialog({
          type:
            "error",

          title:
            "החיבור נכשל",

          message:
            searchParams.get(
              "message"
            ) ||
            "החיבור ל-Microsoft נכשל.",
        });
      }
    },
    [
      searchParams,
    ]
  );

  const connectionStatus =
    useMemo(
      () => {
        if (
          !config
        ) {
          return "disconnected";
        }

        return (
          config.status ||
          (
            config.connected
              ? "connected"
              : "disconnected"
          )
        );
      },
      [
        config,
      ]
    );

  const statusLabel =
    CONNECTION_STATUS_LABELS[
      connectionStatus
    ] ||
    connectionStatus ||
    "לא מחובר";

  const syncStatusLabel =
    SYNC_STATUS_LABELS[
      String(
        config?.lastSyncStatus ||
        "not_started"
      )
    ] ||
    config?.lastSyncStatus ||
    "טרם בוצע סנכרון";

  const statusClasses =
    connectionStatus ===
    "connected"
      ? "bg-green-100 text-green-800"
      : connectionStatus ===
        "needs_business_selection"
        ? "bg-yellow-100 text-yellow-800"
        : connectionStatus ===
          "no_booking_business"
          ? "bg-orange-100 text-orange-800"
          : "bg-gray-100 text-gray-700";

  const handleConnectMicrosoft =
    async () => {
      setConnecting(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "startMicrosoftBookingsAuth"
          );

        const result =
          await fn({});

        const data =
          result.data as {
            authUrl?: string;
          };

        const authUrl =
          String(
            data?.authUrl ||
            ""
          ).trim();

        if (
          !authUrl
        ) {
          throw new Error(
            "לא התקבלה כתובת התחברות ל-Microsoft."
          );
        }

        window.location.assign(
          authUrl
        );
      } catch (
        error: any
      ) {
        setConnecting(
          false
        );

        setDialog({
          type:
            "error",

          title:
            "החיבור נכשל",

          message:
            error?.message ||
            "לא ניתן להתחיל את החיבור ל-Microsoft.",
        });
      }
    };

  const handleSelectBusiness =
    async () => {
      if (
        !selectedBusinessId
      ) {
        setDialog({
          type:
            "warning",

          title:
            "לא נבחר עסק",

          message:
            "יש לבחור עסק Microsoft Bookings.",
        });

        return;
      }

      setSavingBusiness(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "selectMicrosoftBookingsBusiness"
          );

        const result =
          await fn({
            businessId:
              selectedBusinessId,
          });

        const data =
          result.data as {
            bookingBusinessName?:
              string |
              null;
          };

        setDialog({
          type:
            "success",

          title:
            "העסק נשמר",

          message:
            `עסק ה-Bookings${
              data.bookingBusinessName
                ? ` ${data.bookingBusinessName}`
                : ""
            } נבחר בהצלחה.`,
        });
      } catch (
        error: any
      ) {
        setDialog({
          type:
            "error",

          title:
            "שמירת העסק נכשלה",

          message:
            error?.message ||
            "לא ניתן לשמור את עסק ה-Bookings.",
        });
      } finally {
        setSavingBusiness(
          false
        );
      }
    };

  const handleSyncNow =
    async () => {
      setSyncing(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "syncMicrosoftBookingsNow"
          );

        const result =
          await fn({});

        const data =
          result.data as {
            appointments?: number;
            matched?: number;
            unmatched?: number;
            createdEvents?: number;
            cancelledEvents?: number;
          };

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
        setDialog({
          type:
            "error",

          title:
            "הסנכרון נכשל",

          message:
            error?.message ||
            "לא ניתן לסנכרן את פגישות Bookings.",
        });
      } finally {
        setSyncing(
          false
        );
      }
    };

const handleDiagnoseAppointment =
  async () => {
    const appointmentId =
      diagnosticAppointmentId.trim();

    if (!appointmentId) {
      setDialog({
        type: "warning",
        title: "חסר מזהה פגישה",
        message:
          "יש להדביק את appointmentId שנשמר במסמך booking_appointments.",
      });

      return;
    }

    setDiagnosingAppointment(true);
    setDiagnosticResult(null);

    try {
      const fn =
        httpsCallable(
          functions,
          "diagnoseMicrosoftBookingAppointment"
        );

      const response =
        await fn({
          appointmentId,
        });

      const result =
        response.data as Record<
          string,
          any
        >;

      console.log(
        "[Microsoft Booking Diagnostic]",
        result
      );

      setDiagnosticResult(result);

      setDialog({
        type: "success",
        title: "בדיקת הפגישה הסתיימה",
        message:
          "הבדיקה הסתיימה. התוצאה המלאה מוצגת בתחתית המסך וגם ב-Console.",
      });
    } catch (error: any) {
      console.error(
        "[Microsoft Booking Diagnostic] failed",
        error
      );

      setDialog({
        type: "error",
        title: "בדיקת הפגישה נכשלה",
        message:
          error?.message ||
          "לא ניתן לבדוק את הפגישה מול Microsoft.",
      });
    } finally {
      setDiagnosingAppointment(false);
    }
  };



  const handleTestConnection =
    async () => {
      setTestingConnection(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "testMicrosoftBookingsConnection"
          );

        const result =
          await fn({});

        const data =
          result.data as {
            microsoftUserEmail?:
              string |
              null;

            bookingBusinessName?:
              string |
              null;
          };

        setDialog({
          type:
            "success",

          title:
            "החיבור תקין",

          message:
            `Microsoft מחובר בהצלחה${
              data.microsoftUserEmail
                ? ` כ-${data.microsoftUserEmail}`
                : ""
            }${
              data.bookingBusinessName
                ? ` לעסק ${data.bookingBusinessName}`
                : ""
            }.`,
        });
      } catch (
        error: any
      ) {
        setDialog({
          type:
            "error",

          title:
            "בדיקת החיבור נכשלה",

          message:
            error?.message ||
            "לא ניתן לאמת את החיבור ל-Microsoft.",
        });
      } finally {
        setTestingConnection(
          false
        );
      }
    };

  const handleDisconnect =
    async () => {
      const approved =
        window.confirm(
          "האם לנתק את חשבון Microsoft Bookings? הסנכרון האוטומטי יופסק."
        );

      if (
        !approved
      ) {
        return;
      }

      setDisconnecting(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "disconnectMicrosoftBookings"
          );

        await fn({});

        setDialog({
          type:
            "success",

          title:
            "החשבון נותק",

          message:
            "החיבור ל-Microsoft Bookings נותק.",
        });
      } catch (
        error: any
      ) {
        setDialog({
          type:
            "error",

          title:
            "הניתוק נכשל",

          message:
            error?.message ||
            "לא ניתן לנתק את חשבון Microsoft.",
        });
      } finally {
        setDisconnecting(
          false
        );
      }
    };

  if (
    isLoading ||
    isChecking ||
    loadingConfig
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-5xl p-6"
      >
        <div className="rounded-xl border bg-white p-6">
          טוען הגדרות Microsoft Bookings...
        </div>
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
      className="mx-auto max-w-5xl space-y-6 p-6 text-right"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">
          Microsoft Bookings
        </h1>

        <p className="text-sm leading-6 text-gray-600">
          חיבור Microsoft 365 מאפשר ל-MagicTouch לזהות פגישות,
          לשייך אותן לאנשי קשר ולהפעיל תהליכים אוטומטיים.
        </p>
      </header>

      <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              מצב החיבור
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              החיבור מתבצע ישירות מול Microsoft Graph.
            </p>
          </div>

          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${statusClasses}`}
          >
            {statusLabel}
          </span>
        </div>

        {!config?.connected &&
          connectionStatus !==
            "needs_business_selection" && (
            <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
              <div className="text-sm text-gray-700">
                יש להתחבר עם חשבון Microsoft 365 שמורשה לגשת ל-Bookings.
              </div>

              <Button
                text={
                  connecting
                    ? "מעביר ל-Microsoft..."
                    : "התחבר ל-Microsoft Bookings"
                }
                onClick={
                  handleConnectMicrosoft
                }
                disabled={
                  connecting ||
                  !agentId
                }
              />
            </div>
          )}

        {connectionStatus ===
          "needs_business_selection" && (
            <div className="space-y-4 rounded-xl border border-yellow-300 bg-yellow-50 p-4">
              <div>
                <div className="font-bold">
                  בחירת עסק Microsoft Bookings
                </div>

                <div className="mt-1 text-sm text-gray-700">
                  נמצאו מספר עסקים. יש לבחור את העסק שיחובר.
                </div>
              </div>

              <select
                className="w-full rounded-lg border bg-white px-3 py-2"
                value={
                  selectedBusinessId
                }
                onChange={(
                  event
                ) =>
                  setSelectedBusinessId(
                    event.target.value
                  )
                }
              >
                <option value="">
                  בחר עסק
                </option>

                {(config?.availableBusinesses ||
                  []).map(
                  (
                    business
                  ) => (
                    <option
                      key={
                        business.id
                      }
                      value={
                        business.id
                      }
                    >
                      {
                        business.displayName
                      }
                    </option>
                  )
                )}
              </select>

              <Button
                text={
                  savingBusiness
                    ? "שומר בחירה..."
                    : "שמור עסק Bookings"
                }
                onClick={
                  handleSelectBusiness
                }
                disabled={
                  savingBusiness ||
                  !selectedBusinessId
                }
              />
            </div>
          )}

        {config && (
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard
              label="חשבון Microsoft"
              value={
                config.microsoftUserEmail ||
                config.microsoftUserName ||
                "-"
              }
            />

            <InfoCard
              label="עסק Bookings"
              value={
                config.bookingBusinessName ||
                "-"
              }
            />

            <InfoCard
              label="קישור ציבורי"
              value={
                config.bookingBusinessPublicUrl ||
                "-"
              }
            />

            <InfoCard
              label="סנכרון אחרון"
              value={
                formatTimestamp(
                  config.lastSyncAt
                )
              }
            />

            <InfoCard
              label="סטטוס סנכרון"
              value={
                syncStatusLabel
              }
            />

            <InfoCard
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

            <InfoCard
              label="פגישות ששויכו"
              value={
                config.lastSyncMatchedCount !=
                null
                  ? String(
                    config.lastSyncMatchedCount
                  )
                  : "-"
              }
            />

            <InfoCard
              label="פגישות ללא התאמה"
              value={
                config.lastSyncUnmatchedCount !=
                null
                  ? String(
                    config.lastSyncUnmatchedCount
                  )
                  : "-"
              }
            />

            <InfoCard
              label="פגישות מבוטלות"
              value={
                config.lastSyncCancelledCount !=
                null
                  ? String(
                    config.lastSyncCancelledCount
                  )
                  : "-"
              }
            />

            <InfoCard
              label="אירועי פגישה חדשים"
              value={
                config.lastSyncCreatedEventCount !=
                null
                  ? String(
                    config.lastSyncCreatedEventCount
                  )
                  : "-"
              }
            />

            <InfoCard
              label="אירועי ביטול חדשים"
              value={
                config.lastSyncCancelledEventCount !=
                null
                  ? String(
                    config.lastSyncCancelledEventCount
                  )
                  : "-"
              }
            />
          </div>
        )}

        {config?.lastSyncError && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
            {config.lastSyncError}
          </div>
        )}

        {config?.connected && (
          <div className="flex flex-wrap gap-3">
            <Button
              text={
                syncing
                  ? "מסנכרן..."
                  : "סנכרן פגישות עכשיו"
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
                testingConnection
                  ? "בודק חיבור..."
                  : "בדוק חיבור Microsoft"
              }
              onClick={
                handleTestConnection
              }
              disabled={
                testingConnection
              }
            />

            <Button
              text={
                disconnecting
                  ? "מנתק..."
                  : "נתק חשבון Microsoft"
              }
              onClick={
                handleDisconnect
              }
              disabled={
                disconnecting
              }
            />
          </div>
        )}
{config?.connected && (
  <div className="space-y-4 rounded-xl border border-dashed border-purple-300 bg-purple-50 p-4">
    <div>
      <h3 className="font-bold text-purple-900">
        בדיקת פגישה מול Microsoft
      </h3>

      <p className="mt-1 text-sm leading-6 text-purple-800">
        כלי זמני לבדיקת פגישה ב־calendarView,
        ברשימת appointments ובקריאה ישירה לפי
        appointmentId.
      </p>
    </div>

    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        Appointment ID
      </span>

      <textarea
        className="min-h-24 w-full rounded-lg border bg-white px-3 py-2 text-left"
        dir="ltr"
        value={
          diagnosticAppointmentId
        }
        onChange={(event) =>
          setDiagnosticAppointmentId(
            event.target.value
          )
        }
        placeholder="AAMkAG..."
      />
    </label>

    <Button
      text={
        diagnosingAppointment
          ? "בודק מול Microsoft..."
          : "בדוק פגישה"
      }
      onClick={
        handleDiagnoseAppointment
      }
      disabled={
        diagnosingAppointment ||
        !diagnosticAppointmentId.trim()
      }
    />

    {diagnosticResult && (
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard
            label="Calendar View"
            value={
              diagnosticResult
                ?.calendarView
                ?.found
                ? "נמצאה"
                : "לא נמצאה"
            }
          />

          <InfoCard
            label="Appointments List"
            value={
              diagnosticResult
                ?.appointmentsList
                ?.found
                ? "נמצאה"
                : "לא נמצאה"
            }
          />

          <InfoCard
            label="Direct Lookup"
            value={
              diagnosticResult
                ?.directLookup
                ?.found
                ? `נמצאה – HTTP ${
                    diagnosticResult
                      ?.directLookup
                      ?.status
                  }`
                : `לא נמצאה – HTTP ${
                    diagnosticResult
                      ?.directLookup
                      ?.status ??
                    "-"
                  }`
            }
          />
        </div>

        <details className="rounded-lg border bg-white p-3">
          <summary className="cursor-pointer font-bold">
            הצגת התוצאה המלאה
          </summary>

          <pre
            dir="ltr"
            className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-4 text-left text-xs text-white"
          >
            {JSON.stringify(
              diagnosticResult,
              null,
              2
            )}
          </pre>
        </details>
      </div>
    )}
  </div>
)}
      </section>

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
    </main>
  );
}
