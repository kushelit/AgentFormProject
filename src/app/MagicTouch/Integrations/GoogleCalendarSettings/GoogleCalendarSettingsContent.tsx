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

import DialogNotification from
  "@/components/DialogNotification";

import AccessDenied from
  "@/components/AccessDenied";

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

type GoogleCalendarItem = {
  id:
    string;

  summary:
    string;

  description?:
    string |
    null;

  primary?:
    boolean;

  accessRole?:
    string |
    null;

  timeZone?:
    string |
    null;
};

type GoogleCalendarConfig = {
  status?:
    string;

  connected?:
    boolean;

  googleAccount?:
    string |
    null;

  availableCalendars?:
    GoogleCalendarItem[];

  selectedCalendarId?:
    string |
    null;

  selectedCalendarName?:
    string |
    null;

  selectedCalendarTimeZone?:
    string |
    null;

  defaultBookingUrl?:
    string |
    null;

  scope?:
    string |
    null;

  connectedAt?:
    unknown;

  updatedAt?:
    unknown;
};

function s(
  value:
    unknown
): string {
  return String(
    value ??
    ""
  ).trim();
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-500">
        {label}
      </div>

      <div className="mt-1 break-words text-sm font-bold text-slate-900">
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
    selectingCalendarId,
    setSelectingCalendarId,
  ] =
    useState<string | null>(
      null
    );

  const [
    bookingUrl,
    setBookingUrl,
  ] =
    useState(
      ""
    );

  const [
    savingBookingUrl,
    setSavingBookingUrl,
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

            setBookingUrl(
              ""
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

          const nextConfig:
            GoogleCalendarConfig = {
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
            };

          setConfig(
            nextConfig
          );

          setBookingUrl(
            nextConfig
              .defaultBookingUrl ||
            ""
          );

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

  /*
   * לפגישות אנחנו מציגים רק
   * יומנים שניתן לכתוב אליהם.
   *
   * לדוגמה:
   * "חגים בישראל" מגיע כ-reader
   * ולכן לא יוצג כאן.
   */
  const writableCalendars =
    useMemo(
      () =>
        calendars.filter(
          (
            calendar
          ) => {
            const role =
              s(
                calendar.accessRole
              ).toLowerCase();

            return (
              role ===
                "owner" ||
              role ===
                "writer"
            );
          }
        ),
      [
        calendars,
      ]
    );

  const selectedCalendar =
    useMemo(
      () => {
        const id =
          s(
            config
              ?.selectedCalendarId
          );

        if (
          !id
        ) {
          return null;
        }

        return (
          writableCalendars.find(
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
        writableCalendars,
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
        error:
          any
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

  const handleSelectCalendar =
    async (
      calendar:
        GoogleCalendarItem
    ) => {
      setSelectingCalendarId(
        calendar.id
      );

      try {
        const fn =
          httpsCallable<
            {
              calendarId:
                string;
            },
            {
              ok:
                boolean;

              selectedCalendarId:
                string;

              selectedCalendarName:
                string;
            }
          >(
            functions,
            "selectGoogleCalendar"
          );

        await fn({
          calendarId:
            calendar.id,
        });

        setDialog({
          type:
            "success",

          title:
            "היומן נבחר",

          message:
            `היומן "${calendar.summary}" הוגדר כיומן הפגישות של MagicTouch.`,
        });
      } catch (
        error:
          any
      ) {
        console.error(
          "[GoogleCalendarSettings] selecting calendar failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "בחירת היומן נכשלה",

          message:
            error?.message ||
            "לא ניתן לבחור את היומן.",
        });
      } finally {
        setSelectingCalendarId(
          null
        );
      }
    };

  const handleSaveBookingUrl =
    async () => {
      const normalizedUrl =
        s(
          bookingUrl
        );

      if (
        !normalizedUrl
      ) {
        setDialog({
          type:
            "warning",

          title:
            "חסר קישור",

          message:
            "יש להדביק את קישור דף ההזמנה של Google Appointment Schedule.",
        });

        return;
      }

      setSavingBookingUrl(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              bookingUrl:
                string;
            },
            {
              ok:
                boolean;

              defaultBookingUrl:
                string |
                null;
            }
          >(
            functions,
            "saveGoogleCalendarBookingUrl"
          );

        await fn({
          bookingUrl:
            normalizedUrl,
        });

        setDialog({
          type:
            "success",

          title:
            "קישור הפגישה נשמר",

          message:
            "MagicTouch יוכל להשתמש בקישור הזה באוטומציות לשליחת פגישה.",
        });
      } catch (
        error:
          any
      ) {
        console.error(
          "[GoogleCalendarSettings] saving booking URL failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "שמירת הקישור נכשלה",

          message:
            error?.message ||
            "לא ניתן לשמור את קישור הפגישה.",
        });
      } finally {
        setSavingBookingUrl(
          false
        );
      }
    };

  const handleCopyBookingUrl =
    async () => {
      const url =
        s(
          config
            ?.defaultBookingUrl
        );

      if (
        !url
      ) {
        return;
      }

      try {
        await navigator
          .clipboard
          .writeText(
            url
          );

        setDialog({
          type:
            "success",

          title:
            "הקישור הועתק",

          message:
            "קישור הפגישה הועתק ללוח.",
        });
      } catch {
        setDialog({
          type:
            "error",

          title:
            "לא ניתן להעתיק",

          message:
            "לא ניתן להעתיק את הקישור ללוח.",
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
        <h1 className="text-2xl font-bold text-slate-950">
          Google Calendar
        </h1>

        <p className="text-sm leading-6 text-slate-600">
          חיבור Google Calendar מאפשר ל-MagicTouch
          לעבוד עם היומן של הסוכן ולשלב פגישות
          בתהליכי האוטומציה.
        </p>
      </header>

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              מצב החיבור
            </h2>

            <p className="mt-1 text-sm text-slate-500">
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
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm leading-6 text-slate-700">
              התחברי עם חשבון Google שבו נמצא
              היומן שבו מנוהלות הפגישות.
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
              label="יומנים זמינים לפגישות"
              value={
                String(
                  writableCalendars
                    .length
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
              שלב 1
            </div>

            <h2 className="mt-1 text-xl font-bold text-slate-900">
              בחירת יומן לפגישות
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              בחרי את היומן שבו ינוהלו הפגישות.
              מוצגים רק יומנים שבהם יש הרשאת כתיבה.
            </p>
          </div>

          {writableCalendars.length ===
          0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              לא נמצא יומן Google שניתן לכתוב אליו.
            </div>
          ) : (
            <div className="space-y-3">
              {writableCalendars.map(
                (
                  calendar
                ) => {
                  const selected =
                    calendar.id ===
                    config.selectedCalendarId;

                  const selecting =
                    selectingCalendarId ===
                    calendar.id;

                  return (
                    <div
                      key={
                        calendar.id
                      }
                      className={[
                        "rounded-2xl border p-4 transition",

                        selected
                          ? "border-blue-400 bg-blue-50"
                          : "border-slate-200 bg-white",
                      ].join(
                        " "
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-bold text-slate-900">
                              {
                                calendar.summary
                              }
                            </div>

                            {calendar.primary ? (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                יומן ראשי
                              </span>
                            ) : null}
                          </div>

                          <div
                            className="mt-1 text-xs text-slate-400"
                            dir="ltr"
                          >
                            {
                              calendar.id
                            }
                          </div>

                          {calendar.timeZone ? (
                            <div className="mt-2 text-xs text-slate-500">
                              אזור זמן:{" "}
                              {
                                calendar.timeZone
                              }
                            </div>
                          ) : null}
                        </div>

                        {selected ? (
                          <span className="rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white">
                            ✓ נבחר
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={
                              Boolean(
                                selectingCalendarId
                              )
                            }
                            onClick={() =>
                              handleSelectCalendar(
                                calendar
                              )
                            }
                            className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
                          >
                            {selecting
                              ? "שומר..."
                              : "בחר יומן זה"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}

          {selectedCalendar ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
              MagicTouch יעבוד עם היומן{" "}
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

      {config?.connected &&
      selectedCalendar ? (
        <section className="space-y-5 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
          <div>
            <div className="text-sm font-semibold text-violet-600">
              שלב 2
            </div>

            <h2 className="mt-1 text-xl font-bold text-slate-900">
              קישור לקביעת פגישה
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              צרי Google Appointment Schedule
              והדביקי כאן את הקישור של דף ההזמנה.
              הקישור ישמש את MagicTouch
              באוטומציות מול הלקוחות.
            </p>
          </div>

          <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
            <div className="font-bold text-slate-900">
              Google Appointment Schedule
            </div>

            <p className="mt-1 text-sm leading-6 text-slate-600">
              אם עדיין אין דף הזמנה,
              היכנסי ל-Google Calendar
              וצרי Appointment Schedule.
            </p>

            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50"
            >
              פתח Google Calendar
            </a>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              קישור דף ההזמנה
            </span>

            <input
              dir="ltr"
              type="url"
              value={
                bookingUrl
              }
              onChange={(
                event
              ) =>
                setBookingUrl(
                  event.target.value
                )
              }
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-left text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
              placeholder="https://calendar.google.com/calendar/appointments/..."
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={
                savingBookingUrl
              }
              onClick={
                handleSaveBookingUrl
              }
              className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
            >
              {savingBookingUrl
                ? "שומר..."
                : "שמור קישור פגישה"}
            </button>

            {config.defaultBookingUrl ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
                ✓ קישור פגישה מוגדר
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
                עדיין לא הוגדר קישור
              </span>
            )}
          </div>

          {config.defaultBookingUrl ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500">
                קישור ברירת המחדל
              </div>

              <div
                dir="ltr"
                className="mt-2 break-all text-left text-sm font-medium text-slate-800"
              >
                {
                  config.defaultBookingUrl
                }
              </div>

              <button
                type="button"
                onClick={
                  handleCopyBookingUrl
                }
                className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                העתק קישור
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {config?.connected &&
      selectedCalendar &&
      config.defaultBookingUrl ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <div className="text-2xl">
              ✓
            </div>

            <div>
              <div className="font-bold text-emerald-900">
                Google Calendar מוכן לעבודה
              </div>

              <p className="mt-1 text-sm leading-6 text-emerald-800">
                MagicTouch מחובר ליומן,
                נבחר יומן לפגישות וקישור
                ההזמנה מוגדר.
              </p>
            </div>
          </div>
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