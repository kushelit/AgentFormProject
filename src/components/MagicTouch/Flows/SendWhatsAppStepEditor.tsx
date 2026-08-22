"use client";

import React, {
  useRef,
} from "react";

import type {
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

type Props = {
  step: FlowStep;
  onConfigChange: (
    patch: Record<string, unknown>
  ) => void;
};

type ReplyButton = {
  id: string;
  title: string;
};

const BOOKING_URL_TOKEN =
  "{{agent.booking.defaultServiceUrl}}";

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeButtons(
  value: unknown
): ReplyButton[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value
    .slice(
      0,
      3
    )
    .map(
      (
        button: any
      ) => ({
        id:
          s(
            button?.id
          ),
        title:
          s(
            button?.title
          ),
      })
    );
}

export default function SendWhatsAppStepEditor({
  step,
  onConfigChange,
}: Props) {
  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );

  const mode =
    s(
      step.config
        ?.mode
    ) ===
    "interactive_buttons"
      ? "interactive_buttons"
      : "text";

  const message =
    String(
      step.config
        ?.message ||
      ""
    );

  const buttons =
    normalizeButtons(
      step.config
        ?.buttons
    );

  const updateMessage =
    (
      nextMessage: string
    ) => {
      onConfigChange({
        mode,
        message:
          nextMessage,
      });
    };

  const updateMode =
    (
      nextMode:
        | "text"
        | "interactive_buttons"
    ) => {
      onConfigChange({
        mode:
          nextMode,

        message,

        buttons:
          nextMode ===
          "interactive_buttons"
            ? (
                buttons.length >
                0
                  ? buttons
                  : [
                      {
                        id:
                          "",
                        title:
                          "",
                      },
                      {
                        id:
                          "",
                        title:
                          "",
                      },
                    ]
              )
            : [],
      });
    };

  const updateButtons =
    (
      nextButtons: ReplyButton[]
    ) => {
      onConfigChange({
        mode:
          "interactive_buttons",

        buttons:
          nextButtons.slice(
            0,
            3
          ),
      });
    };

  const addButton =
    () => {
      if (
        buttons.length >=
        3
      ) {
        return;
      }

      updateButtons([
        ...buttons,
        {
          id:
            "",
          title:
            "",
        },
      ]);
    };

  const updateButton =
    (
      index: number,
      patch: Partial<ReplyButton>
    ) => {
      updateButtons(
        buttons.map(
          (
            button,
            buttonIndex
          ) =>
            buttonIndex ===
            index
              ? {
                  ...button,
                  ...patch,
                }
              : button
        )
      );
    };

  const removeButton =
    (
      index: number
    ) => {
      updateButtons(
        buttons.filter(
          (
            _,
            buttonIndex
          ) =>
            buttonIndex !==
            index
        )
      );
    };

  const insertToken =
    (
      token: string
    ) => {
      const textarea =
        textareaRef.current;

      if (
        !textarea
      ) {
        const separator =
          message &&
          !message.endsWith(
            "\n"
          )
            ? "\n"
            : "";

        updateMessage(
          `${message}${separator}${token}`
        );

        return;
      }

      const start =
        textarea.selectionStart ??
        message.length;

      const end =
        textarea.selectionEnd ??
        start;

      const before =
        message.slice(
          0,
          start
        );

      const after =
        message.slice(
          end
        );

      const nextMessage =
        `${before}${token}${after}`;

      updateMessage(
        nextMessage
      );

      requestAnimationFrame(
        () => {
          textarea.focus();

          const nextPosition =
            start +
            token.length;

          textarea.setSelectionRange(
            nextPosition,
            nextPosition
          );
        }
      );
    };

  const bookingTokenExists =
    message.includes(
      BOOKING_URL_TOKEN
    );

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-700">
          סוג הודעה
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            className={[
              "rounded-2xl border p-4 text-right transition",
              mode ===
              "text"
                ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100"
                : "border-slate-200 bg-white hover:border-blue-200",
            ].join(
              " "
            )}
            onClick={() =>
              updateMode(
                "text"
              )
            }
          >
            <div className="font-bold text-slate-900">
              הודעת טקסט
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-500">
              הודעת WhatsApp רגילה ללא כפתורי תשובה.
            </div>
          </button>

          <button
            type="button"
            className={[
              "rounded-2xl border p-4 text-right transition",
              mode ===
              "interactive_buttons"
                ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100"
                : "border-slate-200 bg-white hover:border-blue-200",
            ].join(
              " "
            )}
            onClick={() =>
              updateMode(
                "interactive_buttons"
              )
            }
          >
            <div className="font-bold text-slate-900">
              הודעה עם כפתורי תשובה
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-500">
              עד 3 תשובות מובנות. לכל כפתור מגדירים Action עסקי.
            </div>
          </button>
        </div>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          תוכן ההודעה
        </span>

        <textarea
          ref={
            textareaRef
          }
          className="min-h-44 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          value={
            message
          }
          onChange={(
            event
          ) =>
            updateMessage(
              event.target
                .value
            )
          }
          placeholder="כתבי את ההודעה שתישלח ללקוח..."
        />
      </label>

      {mode ===
      "interactive_buttons" ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-slate-900">
                כפתורי תשובה
              </div>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                מה שהלקוח רואה הוא הכותרת. ה־Action הוא הערך שה־Flow יקבל,
                למשל spouse_insurance_yes או declined.
              </p>
            </div>

            <button
              type="button"
              disabled={
                buttons.length >=
                3
              }
              className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={
                addButton
              }
            >
              + כפתור
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {buttons.map(
              (
                button,
                index
              ) => (
                <div
                  key={
                    index
                  }
                  className="rounded-2xl border border-violet-100 bg-white p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-bold text-slate-800">
                      כפתור {index + 1}
                    </div>

                    <button
                      type="button"
                      className="text-xs font-bold text-red-600"
                      onClick={() =>
                        removeButton(
                          index
                        )
                      }
                    >
                      מחיקה
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">
                        מה הלקוח יראה
                      </span>

                      <input
                        className={
                          fieldClass
                        }
                        value={
                          button.title
                        }
                        maxLength={
                          20
                        }
                        placeholder="כן, אשמח"
                        onChange={(
                          event
                        ) =>
                          updateButton(
                            index,
                            {
                              title:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />

                      <span className="mt-1 block text-[11px] text-slate-400">
                        עד 20 תווים
                      </span>
                    </label>

                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">
                        Action עסקי
                      </span>

                      <input
                        className={
                          fieldClass
                        }
                        value={
                          button.id
                        }
                        dir="ltr"
                        maxLength={
                          256
                        }
                        placeholder="booking"
                        onChange={(
                          event
                        ) =>
                          updateButton(
                            index,
                            {
                              id:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />

                      <span className="mt-1 block text-[11px] text-slate-400">
                        זה הערך שישמש את expectedActions ואת ה־Condition.
                      </span>
                    </label>
                  </div>
                </div>
              )
            )}
          </div>

          <div className="mt-4 rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs leading-5 text-violet-700">
            גם כאשר מוצגים כפתורים, הלקוח עדיין יכול לכתוב מלל חופשי.
            במקרה כזה ה־Action Resolver יכול למפות את המלל לאותם Actions.
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="text-sm font-bold text-slate-800">
          הוספת מידע דינמי
        </div>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          המערכת תחליף את המשתנה בזמן הריצה בערך של הסוכן שמפעיל את ה־Flow.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              insertToken(
                BOOKING_URL_TOKEN
              )
            }
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
          >
            <span>
              📅
            </span>

            <span>
              קישור לפגישת ברירת המחדל
            </span>
          </button>
        </div>

        {bookingTokenExists ? (
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            ✓ ההודעה משתמשת בקישור ה־Booking של הסוכן
          </div>
        ) : null}

        <div className="mt-3 text-xs text-slate-400">
          בזמן הריצה:{" "}
          <span
            dir="ltr"
            className="font-mono"
          >
            {BOOKING_URL_TOKEN}
          </span>
        </div>
      </div>
    </div>
  );
}
