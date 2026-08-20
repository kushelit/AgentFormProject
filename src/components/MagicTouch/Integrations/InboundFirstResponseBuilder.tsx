"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase/firebase";

export type InboundAction =
  | "booking"
  | "callback"
  | "free_text";

export type InboundOption = {
  label: string;
  action: InboundAction;
};

export type InboundSetupState = {
  enabled: boolean;
  welcomeMessage: string;
  options: InboundOption[];
  completed: boolean;
};

type Props = {
  agentId: string;
  onSaved?: (
    state: InboundSetupState
  ) => void;
};

const DEFAULT_WELCOME_MESSAGE =
  "שלום {{firstName}}, תודה שפנית אלינו. איך נוכל לעזור?";

const DEFAULT_OPTIONS: InboundOption[] = [
  {
    label: "לקבוע פגישה",
    action: "booking",
  },
  {
    label: "שיחזרו אליי",
    action: "callback",
  },
  {
    label: "יש לי שאלה אחרת",
    action: "free_text",
  },
];

function normalizeOptions(
  value: unknown
): InboundOption[] {
  if (!Array.isArray(value)) {
    return DEFAULT_OPTIONS;
  }

  const allowed =
    new Set<InboundAction>([
      "booking",
      "callback",
      "free_text",
    ]);

  const result =
    value
      .map(
        (
          item: any
        ) => ({
          label:
            String(
              item?.label ||
                ""
            ).trim(),

          action:
            String(
              item?.action ||
                ""
            ).trim() as InboundAction,
        })
      )
      .filter(
        (
          item
        ) =>
          item.label &&
          allowed.has(
            item.action
          )
      )
      .slice(
        0,
        3
      );

  return result.length
    ? result
    : DEFAULT_OPTIONS;
}

export default function InboundFirstResponseBuilder({
  agentId,
  onSaved,
}: Props) {
  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    saved,
    setSaved,
  ] =
    useState(false);

  const [
    welcomeMessage,
    setWelcomeMessage,
  ] =
    useState(
      DEFAULT_WELCOME_MESSAGE
    );

  const [
    options,
    setOptions,
  ] =
    useState<InboundOption[]>(
      DEFAULT_OPTIONS
    );

  const [
    error,
    setError,
  ] =
    useState("");

  useEffect(() => {
    if (!agentId) {
      setLoading(false);
      return;
    }

    const ref =
      doc(
        db,
        `agents/${agentId}/config/magicTouch`
      );

    return onSnapshot(
      ref,
      (
        snapshot
      ) => {
        const data =
          snapshot.exists()
            ? snapshot.data()
            : {};

        const inboundSetup =
          data?.inboundSetup &&
          typeof data.inboundSetup ===
            "object"
            ? data.inboundSetup
            : null;

        if (
          inboundSetup
        ) {
          setWelcomeMessage(
            String(
              inboundSetup
                ?.welcomeMessage ||
                DEFAULT_WELCOME_MESSAGE
            )
          );

          setOptions(
            normalizeOptions(
              inboundSetup
                ?.options
            )
          );

          setSaved(
            inboundSetup
              ?.completed ===
              true
          );
        } else {
          setWelcomeMessage(
            DEFAULT_WELCOME_MESSAGE
          );

          setOptions(
            DEFAULT_OPTIONS
          );

          setSaved(
            false
          );
        }

        setLoading(
          false
        );
      },
      (
        cause
      ) => {
        console.error(
          "[InboundFirstResponseBuilder] failed loading config",
          cause
        );

        setError(
          "לא ניתן לטעון את הגדרת המענה הראשוני."
        );

        setLoading(
          false
        );
      }
    );
  }, [
    agentId,
  ]);

  const canSave =
    useMemo(
      () => {
        const normalizedMessage =
          welcomeMessage.trim();

        const validOptions =
          options.filter(
            (
              item
            ) =>
              item.label.trim() &&
              item.action
          );

        return (
          Boolean(
            agentId
          ) &&
          Boolean(
            normalizedMessage
          ) &&
          validOptions.length >
            0 &&
          !saving
        );
      },
      [
        agentId,
        welcomeMessage,
        options,
        saving,
      ]
    );

  const updateOption =
    (
      index:
        number,
      patch:
        Partial<InboundOption>
    ) => {
      setSaved(
        false
      );

      setOptions(
        (
          current
        ) =>
          current.map(
            (
              item,
              itemIndex
            ) =>
              itemIndex ===
              index
                ? {
                    ...item,
                    ...patch,
                  }
                : item
          )
      );
    };

  const addOption =
    () => {
      if (
        options.length >=
        3
      ) {
        return;
      }

      setSaved(
        false
      );

      const usedActions =
        new Set(
          options.map(
            (
              item
            ) =>
              item.action
          )
        );

      const nextAction =
        (
          [
            "booking",
            "callback",
            "free_text",
          ] as InboundAction[]
        ).find(
          (
            action
          ) =>
            !usedActions.has(
              action
            )
        ) ||
        "free_text";

      const defaultLabel:
        Record<
          InboundAction,
          string
        > = {
          booking:
            "לקבוע פגישה",

          callback:
            "שיחזרו אליי",

          free_text:
            "יש לי שאלה אחרת",
        };

      setOptions(
        (
          current
        ) => [
          ...current,
          {
            label:
              defaultLabel[
                nextAction
              ],

            action:
              nextAction,
          },
        ]
      );
    };

  const removeOption =
    (
      index:
        number
    ) => {
      if (
        options.length <=
        1
      ) {
        return;
      }

      setSaved(
        false
      );

      setOptions(
        (
          current
        ) =>
          current.filter(
            (
              _item,
              itemIndex
            ) =>
              itemIndex !==
              index
          )
      );
    };

  const handleSave =
    async () => {
      if (
        !canSave
      ) {
        return;
      }

      setSaving(
        true
      );

      setError(
        ""
      );

      try {
        const normalizedOptions =
          options
            .map(
              (
                item
              ) => ({
                label:
                  item.label.trim(),

                action:
                  item.action,
              })
            )
            .filter(
              (
                item
              ) =>
                item.label
            );

        const state:
          InboundSetupState = {
            enabled:
              true,

            welcomeMessage:
              welcomeMessage.trim(),

            options:
              normalizedOptions,

            completed:
              true,
          };

        await setDoc(
          doc(
            db,
            `agents/${agentId}/config/magicTouch`
          ),
          {
            inboundSetup:
              state,

            onboarding: {
              inboundSetupCompleted:
                true,
            },

            updatedAt:
              new Date(),
          },
          {
            merge:
              true,
          }
        );

        setSaved(
          true
        );

        onSaved?.(
          state
        );
      } catch (
        cause
      ) {
        console.error(
          "[InboundFirstResponseBuilder] failed saving config",
          cause
        );

        setError(
          "שמירת המענה הראשוני נכשלה."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  if (
    loading
  ) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        טוען את הגדרת המענה הראשוני...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      {saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="font-black text-emerald-900">
            ✓ המענה הראשוני נשמר
          </div>

          <p className="mt-1 text-sm leading-6 text-emerald-800">
            אפשר לערוך ולשמור שוב בכל שלב.
          </p>
        </div>
      ) : null}

      <section className="rounded-2xl border border-violet-100 bg-white p-5">
        <div className="text-xs font-black text-violet-600">
          הודעת פתיחה
        </div>

        <h3 className="mt-1 text-lg font-black text-slate-950">
          מה הלקוח יקבל כשהוא פונה?
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          אפשר להשתמש בשם הלקוח באמצעות{" "}
          <span className="font-mono font-bold">
            {"{{firstName}}"}
          </span>
          .
        </p>

        <textarea
          value={
            welcomeMessage
          }
          onChange={(
            event
          ) => {
            setSaved(
              false
            );

            setWelcomeMessage(
              event.target.value
            );
          }}
          rows={4}
          className="mt-4 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-xs font-black text-violet-600">
          אפשרויות ללקוח
        </div>

        <h3 className="mt-1 text-lg font-black text-slate-950">
          מה הלקוח יכול לבחור?
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          בחרו רק את האפשרויות שמתאימות לעסק. צריך לפחות אפשרות אחת ואפשר להגדיר עד 3.
          הפעולה תשמש אחר כך את מנוע ה־Flow.
        </p>

        <div className="mt-4 space-y-4">
          {options.map(
            (
              item,
              index
            ) => (
              <div
                key={
                  `${item.action}-${index}`
                }
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-black text-slate-700">
                    אפשרות {index + 1}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      removeOption(
                        index
                      )
                    }
                    disabled={
                      options.length <=
                      1
                    }
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-35"
                    title={
                      options.length <=
                      1
                        ? "חייבת להישאר לפחות אפשרות אחת"
                        : "הסרת אפשרות"
                    }
                  >
                    הסרה
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      טקסט ללקוח
                    </label>

                    <input
                      type="text"
                      value={
                        item.label
                      }
                      onChange={(
                        event
                      ) =>
                        updateOption(
                          index,
                          {
                            label:
                              event.target.value,
                          }
                        )
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      פעולה
                    </label>

                    <select
                      value={
                        item.action
                      }
                      onChange={(
                        event
                      ) =>
                        updateOption(
                          index,
                          {
                            action:
                              event.target.value as InboundAction,
                          }
                        )
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                    >
                      <option value="booking">
                        קביעת פגישה
                      </option>

                      <option value="callback">
                        בקשת חזרה
                      </option>

                      <option value="free_text">
                        שאלה אחרת / טקסט חופשי
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {options.length}/3 אפשרויות
          </div>

          <button
            type="button"
            onClick={
              addOption
            }
            disabled={
              options.length >=
              3
            }
            className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + הוספת אפשרות
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
        <div className="font-black text-blue-900">
          תצוגה מקדימה
        </div>

        <div className="mt-4 rounded-2xl bg-[#efeae2] p-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="whitespace-pre-wrap text-sm text-slate-800">
              {welcomeMessage.replace(
                /\{\{firstName\}\}/g,
                "ישראל"
              )}
            </div>

            <div className="mt-4 divide-y border-t">
              {options
                .filter(
                  (
                    item
                  ) =>
                    item.label.trim()
                )
                .map(
                  (
                    item
                  ) => (
                    <div
                      key={
                        `${item.action}-${item.label}`
                      }
                      className="py-2 text-center text-sm font-semibold text-blue-600"
                    >
                      {item.label}
                    </div>
                  )
                )}
            </div>
          </div>
        </div>
      </section>

      <button
        type="button"
        disabled={
          !canSave
        }
        onClick={() =>
          void handleSave()
        }
        className="w-full rounded-xl bg-violet-600 px-6 py-3 font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving
          ? "שומר..."
          : saved
            ? "שמור שינויים"
            : "שמור מענה ראשוני"}
      </button>
    </div>
  );
}
