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
  Button,
} from "@/components/Button/Button";

import DialogNotification from
  "@/components/DialogNotification";

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

export type GoogleCalendarItem = {
  id: string;
  summary: string;
  description?: string | null;
  primary?: boolean;
  accessRole?: string | null;
  timeZone?: string | null;
};

export type GoogleCalendarConfig = {
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

export type GoogleCalendarSetupState = {
  connected: boolean;
  ready: boolean;
  selectedCalendarId: string | null;
  selectedCalendarName: string | null;
  defaultBookingUrl: string | null;
  googleAccount: string | null;
};

type Props = {
  agentId: string;
  compact?: boolean;
  onStateChange?: (
    state: GoogleCalendarSetupState
  ) => void;
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

export default function GoogleCalendarSetup({
  agentId,
  compact = false,
  onStateChange,
}: Props) {
  const searchParams =
    useSearchParams();

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
    useState(true);

  const [
    connecting,
    setConnecting,
  ] =
    useState(false);

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
    useState("");

  const [
    savingBookingUrl,
    setSavingBookingUrl,
  ] =
    useState(false);

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
        setConfig(null);
        setBookingUrl("");
        setLoadingConfig(false);
        return;
      }

      setLoadingConfig(true);

      const ref =
        doc(
          db,
          `agents/${agentId}/config/googleCalendar`
        );

      return onSnapshot(
        ref,
        (snapshot) => {
          if (
            !snapshot.exists()
          ) {
            setConfig(null);
            setBookingUrl("");
            setLoadingConfig(false);
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

          setLoadingConfig(false);
        },
        (error) => {
          console.error(
            "[GoogleCalendarSetup] config listener failed",
            error
          );

          setLoadingConfig(false);

          setDialog({
            type: "error",
            title: "שגיאה",
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

      if (!result) {
        return;
      }

      if (
        result ===
        "connected"
      ) {
        setDialog({
          type: "success",
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
          type: "warning",
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
          type: "error",
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

        if (!id) {
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

  const ready =
    config?.connected ===
      true &&
    Boolean(
      config?.selectedCalendarId
    ) &&
    Boolean(
      config?.defaultBookingUrl
    );

  useEffect(
    () => {
      onStateChange?.({
        connected:
          config?.connected ===
          true,

        ready,

        selectedCalendarId:
          config?.selectedCalendarId ||
          null,

        selectedCalendarName:
          config?.selectedCalendarName ||
          null,

        defaultBookingUrl:
          config?.defaultBookingUrl ||
          null,

        googleAccount:
          config?.googleAccount ||
          null,
      });
    },
    [
      config?.connected,
      config?.selectedCalendarId,
      config?.selectedCalendarName,
      config?.defaultBookingUrl,
      config?.googleAccount,
      ready,
      onStateChange,
    ]
  );

  const handleConnectGoogle =
    async () => {
      setConnecting(true);

      try {
        const fn =
          httpsCallable<
            Record<string, never>,
            {
              ok: boolean;
              authUrl: string;
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

        if (!authUrl) {
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
          "[GoogleCalendarSetup] Google connection failed",
          error
        );

        setConnecting(false);

        setDialog({
          type: "error",
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
              calendarId: string;
            },
            {
              ok: boolean;
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
          type: "success",
          title:
            "היומן נבחר",
          message:
            `היומן "${calendar.summary}" הוגדר כיומן הפגישות של MagicTouch.`,
        });
      } catch (
        error: any
      ) {
        console.error(
          "[GoogleCalendarSetup] selecting calendar failed",
          error
        );

        setDialog({
          type: "error",
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

      if (!normalizedUrl) {
        setDialog({
          type: "warning",
          title: "חסר קישור",
          message:
            "יש להדביק את קישור דף ההזמנה של Google Appointment Schedule.",
        });

        return;
      }

      setSavingBookingUrl(true);

      try {
        const fn =
          httpsCallable<
            {
              bookingUrl: string;
            },
            {
              ok: boolean;
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
          type: "success",
          title:
            "קישור הפגישה נשמר",
          message:
            "MagicTouch יוכל להשתמש בקישור הזה באוטומציות לשליחת פגישה.",
        });
      } catch (
        error: any
      ) {
        console.error(
          "[GoogleCalendarSetup] saving booking URL failed",
          error
        );

        setDialog({
          type: "error",
          title:
            "שמירת הקישור נכשלה",
          message:
            error?.message ||
            "לא ניתן לשמור את קישור הפגישה.",
        });
      } finally {
        setSavingBookingUrl(false);
      }
    };

  const handleCopyBookingUrl =
    async () => {
      const url =
        s(
          config
            ?.defaultBookingUrl
        );

      if (!url) {
        return;
      }

      try {
        await navigator
          .clipboard
          .writeText(
            url
          );

        setDialog({
          type: "success",
          title:
            "הקישור הועתק",
          message:
            "קישור הפגישה הועתק ללוח.",
        });
      } catch {
        setDialog({
          type: "error",
          title:
            "לא ניתן להעתיק",
          message:
            "לא ניתן להעתיק את הקישור ללוח.",
        });
      }
    };

  if (
    loadingConfig
  ) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        טוען הגדרות Google Calendar...
      </div>
    );
  }

  return (
    <>
      <div
        className={[
          "space-y-5",
          compact
            ? ""
            : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Google Calendar
            </h2>

            <p className="mt-1 text-sm leading-6 text-slate-500">
              חיבור היומן, בחירת היומן לפגישות
              והגדרת קישור ההזמנה.
            </p>
          </div>

          <span
            className={[
              "rounded-full px-3 py-1 text-sm font-bold",
              ready
                ? "bg-emerald-100 text-emerald-800"
                : config?.connected
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-700",
            ].join(" ")}
          >
            {ready
              ? "מוכן"
              : config?.connected
                ? "מחובר · נדרשת השלמה"
                : "לא מחובר"}
          </span>
        </div>

        {!config?.connected ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm leading-6 text-slate-700">
              התחברו עם חשבון Google שבו נמצא
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
          <>
            {!compact ? (
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
                      writableCalendars.length
                    )
                  }
                />
              </div>
            ) : config.googleAccount ? (
              <div
                className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600"
                dir="ltr"
              >
                {config.googleAccount}
              </div>
            ) : null}

            <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
              <div>
                <div className="text-xs font-black text-blue-600">
                  1
                </div>

                <div className="mt-1 font-black text-slate-900">
                  בחירת יומן לפגישות
                </div>

                <p className="mt-1 text-sm leading-6 text-slate-500">
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
                            "rounded-xl border p-4 transition",
                            selected
                              ? "border-blue-400 bg-white"
                              : "border-slate-200 bg-white",
                          ].join(" ")}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-bold text-slate-900">
                                  {calendar.summary}
                                </div>

                                {calendar.primary ? (
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                    יומן ראשי
                                  </span>
                                ) : null}
                              </div>

                              {calendar.timeZone ? (
                                <div className="mt-2 text-xs text-slate-500">
                                  אזור זמן:{" "}
                                  {calendar.timeZone}
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
                    {selectedCalendar.summary}
                  </strong>
                  .
                </div>
              ) : null}
            </div>

            {selectedCalendar ? (
              <div className="space-y-4 rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
                <div>
                  <div className="text-xs font-black text-violet-600">
                    2
                  </div>

                  <div className="mt-1 font-black text-slate-900">
                    קישור לקביעת פגישה
                  </div>

                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    צרו Google Appointment Schedule
                    והדביקו כאן את קישור דף ההזמנה.
                  </p>
                </div>

                <div className="rounded-xl border border-violet-100 bg-white p-4">
                  <div className="font-bold text-slate-900">
                    Google Appointment Schedule
                  </div>

                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    אם עדיין אין דף הזמנה, פתחו את Google Calendar
                    וצרו Appointment Schedule.
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
                    placeholder="https://calendar.app.google/..."
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
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold text-slate-500">
                      קישור ברירת המחדל
                    </div>

                    <div
                      dir="ltr"
                      className="mt-2 break-all text-left text-sm font-medium text-slate-800"
                    >
                      {config.defaultBookingUrl}
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
              </div>
            ) : null}

            {ready ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
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
              </div>
            ) : null}
          </>
        ) : null}
      </div>

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
    </>
  );
}
