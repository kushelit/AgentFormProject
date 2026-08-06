"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import {
  httpsCallable,
} from "firebase/functions";

import {
  db,
  functions,
} from "@/lib/firebase/firebase";

import { useMagicTouchAgent } from "@/components/MagicTouch/MagicTouchAgentContext";
import AccessDenied from "@/components/AccessDenied";

import {
  useAuth,
} from "@/lib/firebase/AuthContext";

import {
  usePermission,
} from "@/hooks/usePermission";

type PowerOfAttorneyStatus =
  | "waiting_for_signature"
  | "partially_signed"
  | "signed"
  | string;

type TimestampLike = {
  toDate?: () => Date;
};

type ContactRow = {
  id: string;
  agentId: string;
  fullName: string;
  phone: string;
  status: PowerOfAttorneyStatus;
  requestedAt: TimestampLike | null;
  lastCheckedAt: TimestampLike | null;
  signedAt: TimestampLike | null;
  signingUrl: string;
  reminderDue: boolean;
  reminderCount: number;
  signature: {
    hb: boolean;
    policies: boolean;
    swiftness: boolean;
  };
};

type BatchResult = {
  scanned?: number;
  processed?: number;
  signed?: number;
  partiallySigned?: number;
  waiting?: number;
  remindersDue?: number;
  skipped?: number;
  failed?: number;
};

type SingleCheckResult = {
  status?: string;
  fullySigned?: boolean;
  partiallySigned?: boolean;
  reminderDue?: boolean;
};

type FilterKey =
  | "all"
  | "waiting"
  | "partial"
  | "signed"
  | "reminder";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function asBoolean(
  value: unknown
): boolean {
  return value === true;
}

function formatTimestamp(
  value: TimestampLike | null
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

function statusLabel(
  status: PowerOfAttorneyStatus
): string {
  switch (status) {
    case "waiting_for_signature":
      return "ממתין לחתימה";

    case "partially_signed":
      return "חתום חלקית";

    case "signed":
      return "חתום";

    default:
      return status || "-";
  }
}

function statusClass(
  status: PowerOfAttorneyStatus
): string {
  switch (status) {
    case "signed":
      return "bg-emerald-100 text-emerald-700";

    case "partially_signed":
      return "bg-amber-100 text-amber-700";

    case "waiting_for_signature":
      return "bg-blue-100 text-blue-700";

    default:
      return "bg-slate-100 text-slate-700";
  }
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
    return s(
      (
        error as {
          message?: unknown;
        }
      ).message
    ) || "אירעה שגיאה";
  }

  return "אירעה שגיאה לא ידועה";
}

function SummaryCard({
  title,
  value,
  active,
  onClick,
}: {
  title: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl border p-4 text-right shadow-sm transition",
        active
          ? "border-blue-400 bg-blue-50"
          : "border-slate-200 bg-white hover:border-blue-200",
      ].join(" ")}
    >
      <div className="text-sm font-semibold text-slate-500">
        {title}
      </div>

      <div className="mt-2 text-3xl font-bold text-slate-900">
        {value}
      </div>
    </button>
  );
}

function SignatureBadge({
  label,
  signed,
}: {
  label: string;
  signed: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full px-2 py-1 text-xs font-bold",
        signed
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500",
      ].join(" ")}
    >
      {label}: {signed ? "חתום" : "לא"}
    </span>
  );
}

export default function MagicTouchMonitorPage() {
  const {
    user,
    isLoading:
      authLoading,
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

  const {
    selectedAgentId,
  } =
    useMagicTouchAgent();

  const [
    rows,
    setRows,
  ] =
    useState<ContactRow[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    runningAll,
    setRunningAll,
  ] =
    useState(false);

  const [
    runningContactId,
    setRunningContactId,
  ] =
    useState("");

  const [
    filter,
    setFilter,
  ] =
    useState<FilterKey>(
      "all"
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  useEffect(
    () => {
      if (
        !selectedAgentId
      ) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const contactsRef =
        collection(
          db,
          `agents/${selectedAgentId}/magic_touch_contacts`
        );

      const contactsQuery =
        query(
          contactsRef,
          where(
            "engagement.reengagement.powerOfAttorney.status",
            "in",
            [
              "waiting_for_signature",
              "partially_signed",
              "signed",
            ]
          )
        );

      return onSnapshot(
        contactsQuery,
        (
          snapshot
        ) => {
          const nextRows =
            snapshot.docs.map(
              (
                document
              ) => {
                const data =
                  document.data();

                const powerOfAttorney =
                  data
                    ?.engagement
                    ?.reengagement
                    ?.powerOfAttorney ||
                  {};

                const signature =
                  powerOfAttorney
                    ?.signature ||
                  {};

                return {
                  id:
                    document.id,

                  agentId:
                    s(
                      data.agentId ||
                      selectedAgentId
                    ),

                  fullName:
                    s(
                      data.fullName
                    ) ||
                    "ללא שם",

                  phone:
                    s(
                      data.phone
                    ),

                  status:
                    s(
                      powerOfAttorney
                        ?.status
                    ),

                  requestedAt:
                    powerOfAttorney
                      ?.requestedAt ||
                    null,

                  lastCheckedAt:
                    powerOfAttorney
                      ?.lastCheckedAt ||
                    null,

                  signedAt:
                    powerOfAttorney
                      ?.signedAt ||
                    null,

                  signingUrl:
                    s(
                      powerOfAttorney
                        ?.signingUrl
                    ),

                  reminderDue:
                    asBoolean(
                      powerOfAttorney
                        ?.reminderDue
                    ),

                  reminderCount:
                    Number(
                      powerOfAttorney
                        ?.reminderCount ||
                      0
                    ),

                  signature: {
                    hb:
                      asBoolean(
                        signature
                          ?.hb
                      ),

                    policies:
                      asBoolean(
                        signature
                          ?.policies
                      ),

                    swiftness:
                      asBoolean(
                        signature
                          ?.swiftness
                      ),
                  },
                } as ContactRow;
              }
            );

          nextRows.sort(
            (
              a,
              b
            ) => {
              const aMs =
                a.requestedAt
                  ?.toDate?.()
                  .getTime?.() ||
                0;

              const bMs =
                b.requestedAt
                  ?.toDate?.()
                  .getTime?.() ||
                0;

              return bMs - aMs;
            }
          );

          setRows(
            nextRows
          );

          setLoading(
            false
          );
        },
        (
          snapshotError
        ) => {
          console.error(
            "[MagicTouchMonitor] contacts listener failed",
            snapshotError
          );

          setError(
            "לא ניתן לטעון את רשימת ייפויי הכוח."
          );

          setLoading(
            false
          );
        }
      );
    },
    [
      selectedAgentId,
    ]
  );

  const counts =
    useMemo(
      () => ({
        all:
          rows.length,

        waiting:
          rows.filter(
            (
              row
            ) =>
              row.status ===
              "waiting_for_signature"
          ).length,

        partial:
          rows.filter(
            (
              row
            ) =>
              row.status ===
              "partially_signed"
          ).length,

        signed:
          rows.filter(
            (
              row
            ) =>
              row.status ===
              "signed"
          ).length,

        reminder:
          rows.filter(
            (
              row
            ) =>
              row.reminderDue
          ).length,
      }),
      [
        rows,
      ]
    );

  const filteredRows =
    useMemo(
      () => {
        const normalizedSearch =
          search
            .trim()
            .toLowerCase();

        return rows.filter(
          (
            row
          ) => {
            const matchesFilter =
              filter ===
                "all" ||
              (
                filter ===
                  "waiting" &&
                row.status ===
                  "waiting_for_signature"
              ) ||
              (
                filter ===
                  "partial" &&
                row.status ===
                  "partially_signed"
              ) ||
              (
                filter ===
                  "signed" &&
                row.status ===
                  "signed"
              ) ||
              (
                filter ===
                  "reminder" &&
                row.reminderDue
              );

            if (
              !matchesFilter
            ) {
              return false;
            }

            if (
              !normalizedSearch
            ) {
              return true;
            }

            return [
              row.fullName,
              row.phone,
              row.id,
            ]
              .join(" ")
              .toLowerCase()
              .includes(
                normalizedSearch
              );
          }
        );
      },
      [
        rows,
        filter,
        search,
      ]
    );

  const runAll =
    useCallback(
      async () => {
        setRunningAll(
          true
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
              Record<string, never>,
              BatchResult
            >(
              functions,
              "processWaitingPowerOfAttorneySignaturesNow"
            );

          const response =
            await fn({});

          const result =
            response.data;

          setSuccess(
            `הבדיקה הסתיימה: ${result.processed ?? 0} עובדו, ` +
            `${result.signed ?? 0} חתומים, ` +
            `${result.partiallySigned ?? 0} חתומים חלקית, ` +
            `${result.remindersDue ?? 0} דורשי תזכורת, ` +
            `${result.failed ?? 0} נכשלו.`
          );
        } catch (
          runError
        ) {
          setError(
            errorMessage(
              runError
            )
          );
        } finally {
          setRunningAll(
            false
          );
        }
      },
      []
    );

  const runSingle =
    useCallback(
      async (
        row: ContactRow
      ) => {
        setRunningContactId(
          row.id
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
                agentId: string;
                contactId: string;
              },
              SingleCheckResult
            >(
              functions,
              "checkSurenseSignatureNow"
            );

          const response =
            await fn({
              agentId:
                row.agentId ||
                selectedAgentId,

              contactId:
                row.id,
            });

          setSuccess(
            `הבדיקה של ${row.fullName} הסתיימה. ` +
            `סטטוס: ${statusLabel(
              s(
                response
                  .data
                  .status
              )
            )}.`
          );
        } catch (
          runError
        ) {
          setError(
            errorMessage(
              runError
            )
          );
        } finally {
          setRunningContactId(
            ""
          );
        }
      },
      [
        selectedAgentId,
      ]
    );

  if (
    authLoading ||
    isChecking
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-7xl p-6"
      >
        טוען את MagicTouch Monitor...
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
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-blue-600">
              MagicTouch
            </div>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Monitor
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              מעקב תפעולי אחר ייפויי כוח, בדיקות חתימה
              ותהליכים שממתינים לפעולה.
            </p>
          </div>

          <button
            type="button"
            className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() =>
              void runAll()
            }
            disabled={
              runningAll ||
              !selectedAgentId
            }
          >
            {runningAll
              ? "בודק את כל הממתינים..."
              : "בדוק את כל הממתינים עכשיו"}
          </button>
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            title="הכול"
            value={counts.all}
            active={filter === "all"}
            onClick={() =>
              setFilter("all")
            }
          />

          <SummaryCard
            title="ממתינים לחתימה"
            value={counts.waiting}
            active={filter === "waiting"}
            onClick={() =>
              setFilter("waiting")
            }
          />

          <SummaryCard
            title="חתומים חלקית"
            value={counts.partial}
            active={filter === "partial"}
            onClick={() =>
              setFilter("partial")
            }
          />

          <SummaryCard
            title="חתומים"
            value={counts.signed}
            active={filter === "signed"}
            onClick={() =>
              setFilter("signed")
            }
          />

          <SummaryCard
            title="דורשי תזכורת"
            value={counts.reminder}
            active={filter === "reminder"}
            onClick={() =>
              setFilter("reminder")
            }
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                ייפויי כוח
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                מוצגים {filteredRows.length} מתוך {rows.length} לקוחות.
              </p>
            </div>

            <input
              className="h-11 w-full max-w-sm rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="חיפוש לפי שם או טלפון"
            />
          </div>

          {loading ? (
            <div className="py-10 text-center text-slate-500">
              טוען נתונים...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-10 text-center text-slate-500">
              לא נמצאו לקוחות מתאימים.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-right">
                      לקוח
                    </th>

                    <th className="px-4 py-3 text-right">
                      נשלח
                    </th>

                    <th className="px-4 py-3 text-right">
                      נבדק לאחרונה
                    </th>

                    <th className="px-4 py-3 text-right">
                      סטטוס
                    </th>

                    <th className="px-4 py-3 text-right">
                      חתימות
                    </th>

                    <th className="px-4 py-3 text-right">
                      תזכורת
                    </th>

                    <th className="px-4 py-3 text-right">
                      פעולות
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map(
                    (
                      row
                    ) => (
                      <tr
                        key={row.id}
                        className="align-top"
                      >
                        <td className="px-4 py-4">
                          <div className="font-bold text-slate-900">
                            {row.fullName}
                          </div>

                          <div
                            dir="ltr"
                            className="mt-1 text-right text-xs text-slate-500"
                          >
                            {row.phone || "-"}
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                          {formatTimestamp(
                            row.requestedAt
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                          {formatTimestamp(
                            row.lastCheckedAt
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={[
                              "inline-flex rounded-full px-3 py-1 text-xs font-bold",
                              statusClass(
                                row.status
                              ),
                            ].join(" ")}
                          >
                            {statusLabel(
                              row.status
                            )}
                          </span>

                          {row.signedAt ? (
                            <div className="mt-2 text-xs text-emerald-700">
                              {formatTimestamp(
                                row.signedAt
                              )}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex min-w-52 flex-wrap gap-2">
                            <SignatureBadge
                              label="הר הביטוח"
                              signed={
                                row.signature.hb
                              }
                            />

                            <SignatureBadge
                              label="פוליסות"
                              signed={
                                row.signature.policies
                              }
                            />

                            <SignatureBadge
                              label="מסלקה"
                              signed={
                                row.signature.swiftness
                              }
                            />
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          {row.reminderDue ? (
                            <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                              נדרשת תזכורת
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">
                              לא
                            </span>
                          )}

                          {row.reminderCount > 0 ? (
                            <div className="mt-2 text-xs text-slate-500">
                              נשלחו: {row.reminderCount}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex min-w-44 flex-col gap-2">
                            <button
                              type="button"
                              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() =>
                                void runSingle(
                                  row
                                )
                              }
                              disabled={
                                runningContactId ===
                                row.id ||
                                row.status ===
                                "signed"
                              }
                            >
                              {runningContactId ===
                              row.id
                                ? "בודק..."
                                : "בדוק עכשיו"}
                            </button>

                            {row.signingUrl ? (
                              <a
                                href={row.signingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700 hover:bg-slate-50"
                              >
                                פתיחת קישור חתימה
                              </a>
                            ) : null}

                            <a
                              href={`/MagicTouch/Contacts/${row.id}`}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                              פתיחת איש קשר
                            </a>
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            עיבודים פעילים
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-bold text-slate-900">
                בדיקת חתימות יומית
              </div>

              <div className="mt-1 text-sm text-slate-500">
                רצה בכל יום בשעה 09:00 לפי שעון ישראל.
              </div>

              <div className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                פעיל
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-bold text-slate-900">
                סנכרון Microsoft Bookings
              </div>

              <div className="mt-1 text-sm text-slate-500">
                מנוהל במסך האינטגרציה של Microsoft Bookings.
              </div>

              <a
                href="/MagicTouch/Integrations/MicrosoftBookings"
                className="mt-3 inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                מעבר להגדרות
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
