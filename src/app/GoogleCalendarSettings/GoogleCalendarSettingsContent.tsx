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

type GoogleCalendarItem = {
  id: string;
  summary: string;

  description?: string | null;

  primary?: boolean;

  accessRole?: string | null;

  timeZone?: string | null;
};

type GoogleCalendarConfig = {
  status?: string;

  connected?: boolean;

  googleAccount?: string | null;

  availableCalendars?: GoogleCalendarItem[];

  selectedCalendarId?: string | null;

  selectedCalendarName?: string | null;

  selectedCalendarTimeZone?: string | null;

  defaultBookingUrl?: string | null;

  scope?: string | null;

  connectedAt?: unknown;

  updatedAt?: unknown;
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
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

export default function GoogleCalendarSettingsContent() {
  const {
    effectiveAgentId,
  } =
    useMagicTouchAgent();

  const searchParams =
    useSearchParams();

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
        ? "access_magic_touch"
        : null
    );

  const agentId =
    effectiveAgentId;

  const [
    config,
    setConfig,
  ] =
    useState<GoogleCalendarConfig | null>(
      null
    );

  const [
    loadingConfig,
    setLoadingConfig,
  ] =
    useState(
      true
    );

  const [
    connecting,
    setConnecting,
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

      const ref =
        doc(
          db,
          `agents/${agentId}/config/googleCalendar`
        );

      return onSnapshot(
        ref,

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

          const availableCalendars =
            Array.isArray(
              data.availableCalendars
            )
              ? data.availableCalendars.map(
                  (
                    calendar:
                      Record<string, unknown>
                  ) => ({
                    id:
                      s(
                        calendar.id
                      ),

                    summary:
                      s(
                        calendar.summary ||
                        calendar.id
                      ),

                    description:
                      s(
                        calendar.description
                      ) ||
                      null,

                    primary:
                      calendar.primary ===
                      true,

                    accessRole:
                      s(
                        calendar.accessRole
                      ) ||
                      null,

                    timeZone:
                      s(
                        calendar.timeZone
                      ) ||
                      null,
                  })
                )
              : [];

          setConfig({
            status:
              s(
                data.status
              ),

            connected:
              data.connected ===
              true,

            googleAccount:
              s(
                data.googleAccount
              ) ||
              null,

            availableCalendars,

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

            selectedCalendarTimeZone:
              s(
                data.selectedCalendarTimeZone
              ) ||
              null,

            defaultBookingUrl:
              s(
                data.defaultBookingUrl
              ) ||
              null,

            scope:
              s(
                data.scope
              ) ||
              null,

            connectedAt:
              data.connectedAt,

            updatedAt:
              data.updatedAt,
          });

          setLoadingConfig(
            false
          );
        },

        (
          error
        ) => {
          console.error(
            "[GoogleCalendarSettings] config listener failed",
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
      const result =
        searchParams.get(
          "googleCalendar"
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
            "Google Calendar חובר",

          message:
            "חשבון Google Calendar חובר בהצלחה ל-MagicTouch.",
        });

        return;
      }

      if (
        result ===
        "no_calendars"
      ) {
        setDialog({
          type:
            "warning",

          title:
            "לא נמצאו יומנים",

          message:
            "החיבור ל-Google הצליח, אך לא נמצאו יומנים זמינים.",
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
            "החיבור ל-Google Calendar נכשל.",
        });
      }
    },

    [
      searchParams,
    ]
  );

  const calendars =
    useMemo(
      () =>
        config?.availableCalendars ||
        [],
      [
        config,
      ]
    );

  const selectedCalendar =
    useMemo(
      () => {
        const id =
          s(
            config?.selectedCalendarId
          );

        if (
          !id
        ) {
          return null;
        }

        return (
          calendars.find(
            (
              calendar
            ) =>
              calendar.id ===
              id
          ) ||
          null
        );
      },

      [
        calendars,
        config?.selectedCalendarId,
      ]
    );

  const handleConnectGoogle =
    async () => {
      setConnecting(
        true
      );

      try {
        const fn =
          httpsCallable<
            Record<string, never>,
            {
              ok:
                boolean;

              authUrl:
                string;
            }
          >(
            functions,
            "startGoogleCalendarAuth"
          );

        const response =
          await fn({});

        const authUrl =
          s(
            response.data
              ?.authUrl
          );

        if (
          !authUrl
        ) {
          throw new Error(
            "לא התקבלה כתובת התחברות ל-Google."
          );
        }

        window.location.assign(
          authUrl
        );
      } catch (
        error: any
      ) {
        console.error(
          "[GoogleCalendarSettings] Google connection failed",
          error
        );

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
            "לא ניתן להתחיל את החיבור ל-Google Calendar.",
        });
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
          טוען הגדרות Google Calendar...
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
          Google Calendar
        </h1>

        <p className="text-sm leading-6 text-gray-600">
          חיבור Google Calendar מאפשר ל-MagicTouch
          לעבוד עם היומן של הסוכן ולזהות פגישות כחלק
          מתהליכי האוטומציה.
        </p>
      </header>

      <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">
              מצב החיבור
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              החיבור מתבצע ישירות מול Google Calendar.
            </p>
          </div>

          <span
            className={[
              "rounded-full px-3 py-1 text-sm font-bold",

              config?.connected
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-700",
            ].join(
              " "
            )}
          >
            {config?.connected
              ? "מחובר"
              : "לא מחובר"}
          </span>
        </div>

        {!config?.connected ? (
          <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
            <div className="text-sm leading-6 text-gray-700">
              התחברי עם חשבון Google שבו נמצא היומן
              שבו את מנהלת את הפגישות.
            </div>

            <Button
              text={
                connecting
                  ? "מעביר ל-Google..."
                  : "התחבר ל-Google Calendar"
              }
              onClick={
                handleConnectGoogle
              }
              disabled={
                connecting ||
                !agentId
              }
            />
          </div>
        ) : null}

        {config?.connected ? (
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard
              label="חשבון Google"
              value={
                config.googleAccount ||
                "-"
              }
            />

            <InfoCard
              label="יומן שנבחר"
              value={
                config.selectedCalendarName ||
                "-"
              }
            />

            <InfoCard
              label="אזור זמן"
              value={
                config.selectedCalendarTimeZone ||
                "-"
              }
            />

            <InfoCard
              label="מספר יומנים שנמצאו"
              value={
                String(
                  calendars.length
                )
              }
            />
          </div>
        ) : null}
      </section>

      {config?.connected ? (
        <section className="space-y-5 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
          <div>
            <div className="text-sm font-semibold text-blue-600">
              היומנים שלי
            </div>

            <h2 className="mt-1 text-xl font-bold text-slate-900">
              היומנים שנמצאו ב-Google
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              בשלב הזה אנחנו רק בודקים שהחיבור מחזיר
              את היומנים בצורה תקינה. בשלב הבא נוסיף
              אפשרות לבחור יומן אחר.
            </p>
          </div>

          {calendars.length ===
          0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              לא נמצאו יומנים בחשבון Google.
            </div>
          ) : (
            <div className="space-y-3">
              {calendars.map(
                (
                  calendar
                ) => {
                  const selected =
                    calendar.id ===
                    config.selectedCalendarId;

                  return (
                    <div
                      key={
                        calendar.id
                      }
                      className={[
                        "rounded-2xl border p-4",

                        selected
                          ? "border-blue-400 bg-blue-50"
                          : "border-slate-200 bg-white",
                      ].join(
                        " "
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">
                            {
                              calendar.summary
                            }
                          </div>

                          <div
                            className="mt-1 text-xs text-slate-400"
                            dir="ltr"
                          >
                            {
                              calendar.id
                            }
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {calendar.primary ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                              יומן ראשי
                            </span>
                          ) : null}

                          {selected ? (
                            <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                              נבחר
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {calendar.timeZone ? (
                        <div className="mt-3 text-sm text-slate-500">
                          אזור זמן:{" "}
                          {
                            calendar.timeZone
                          }
                        </div>
                      ) : null}
                    </div>
                  );
                }
              )}
            </div>
          )}

          {selectedCalendar ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
              החיבור עובד. MagicTouch זיהה את היומן{" "}
              <strong>
                {
                  selectedCalendar.summary
                }
              </strong>
              .
            </div>
          ) : null}
        </section>
      ) : null}

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
    </main>
  );
}