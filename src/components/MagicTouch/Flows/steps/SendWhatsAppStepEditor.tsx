"use client";

import React, {
  useMemo,
  useRef,
} from "react";

import type {
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

type Props = {
  step: FlowStep;
  steps: Record<string, FlowStep>;
  onReplaceSteps: (
    nextSteps: Record<string, FlowStep>
  ) => void;
};

type ReplyOption = {
  action: string;
  label: string;
  description: string;
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

function getManagedWaitStep(
  step: FlowStep,
  steps: Record<string, FlowStep>
): FlowStep | null {
  const waitStepId =
    s(
      step.config
        ?.managedWaitStepId
    );

  if (
    !waitStepId
  ) {
    return null;
  }

  const waitStep =
    steps[
      waitStepId
    ];

  if (
    !waitStep ||
    waitStep.type !==
      "wait_for_customer_response"
  ) {
    return null;
  }

  return waitStep;
}

function createWaitStepId(
  sendStepId: string,
  steps: Record<string, FlowStep>
): string {
  const baseId =
    `${sendStepId}_wait`;

  if (
    !steps[
      baseId
    ]
  ) {
    return baseId;
  }

  let index =
    2;

  let id =
    `${baseId}_${index}`;

  while (
    steps[
      id
    ]
  ) {
    index +=
      1;

    id =
      `${baseId}_${index}`;
  }

  return id;
}

function getReplyOptions(
  waitStep: FlowStep | null,
  sendStep: FlowStep
): ReplyOption[] {
  const rawWaitOptions =
    waitStep
      ?.config
      ?.responseOptions;

  if (
    Array.isArray(
      rawWaitOptions
    )
  ) {
    const options =
      rawWaitOptions.map(
        (
          option: any
        ) => ({
          action:
            s(
              option?.action
            ),

          label:
            s(
              option?.label
            ),

          description:
            s(
              option?.description
            ),
        })
      );

    if (
      options.length >
      0
    ) {
      return options;
    }
  }

  const rawButtons =
    sendStep.config
      ?.buttons;

  if (
    Array.isArray(
      rawButtons
    )
  ) {
    return rawButtons.map(
      (
        button: any
      ) => ({
        action:
          s(
            button?.id
          ),

        label:
          s(
            button?.title
          ),

        description:
          "",
      })
    );
  }

  return [];
}

export default function SendWhatsAppStepEditor({
  step,
  steps,
  onReplaceSteps,
}: Props) {
  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );

  const managedWaitStep =
    useMemo(
      () =>
        getManagedWaitStep(
          step,
          steps
        ),
      [
        step,
        steps,
      ]
    );

  const waitForResponse =
    Boolean(
      managedWaitStep
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

  const responseOptions =
    getReplyOptions(
      managedWaitStep,
      step
    );

  const resolution =
    managedWaitStep
      ?.config
      ?.resolution &&
    typeof managedWaitStep
      .config
      .resolution ===
      "object"
      ? managedWaitStep
          .config
          .resolution as
          Record<
            string,
            unknown
          >
      : {};

  const resolutionMode =
    s(
      resolution.mode
    ) ||
    "ai_with_human_fallback";

  const minConfidence =
    Number(
      resolution
        .minConfidence ??
      0.8
    );

  const replaceSendOnly =
    (
      patch: Record<string, unknown>
    ) => {
      onReplaceSteps({
        ...steps,

        [
          step.id
        ]: {
          ...step,

          config: {
            ...step.config,
            ...patch,
          },
        },
      });
    };

  const updateManagedResponse =
    ({
      nextMessage =
        message,

      nextMode =
        mode,

      nextOptions =
        responseOptions,

      nextResolutionMode =
        resolutionMode,

      nextMinConfidence =
        minConfidence,

      forceWait =
        waitForResponse,
    }: {
      nextMessage?: string;
      nextMode?: "text" | "interactive_buttons";
      nextOptions?: ReplyOption[];
      nextResolutionMode?: string;
      nextMinConfidence?: number;
      forceWait?: boolean;
    }) => {
      const shouldWait =
        nextMode ===
        "interactive_buttons"
          ? true
          : forceWait;

      const normalizedOptions =
        nextOptions.map(
          (
            option
          ) => ({
            action:
              s(
                option.action
              ),

            label:
              s(
                option.label
              ),

            description:
              s(
                option.description
              ),
          })
        );

      const validOptions =
        normalizedOptions.filter(
          (
            option
          ) =>
            Boolean(
              option.action
            )
        );

      const buttons =
        nextMode ===
        "interactive_buttons"
          ? validOptions
              .filter(
                (
                  option
                ) =>
                  Boolean(
                    option.label
                  )
              )
              .slice(
                0,
                3
              )
              .map(
                (
                  option
                ) => ({
                  id:
                    option.action,

                  title:
                    option.label,
                })
              )
          : [];

      const currentWait =
        getManagedWaitStep(
          step,
          steps
        );

      const nextSteps = {
        ...steps,
      };

      if (
        !shouldWait
      ) {
        const visibleNextStepId =
          currentWait
            ?.nextStepId ||
          step.nextStepId ||
          null;

        if (
          currentWait
        ) {
          delete nextSteps[
            currentWait.id
          ];
        }

        nextSteps[
          step.id
        ] = {
          ...step,

          nextStepId:
            visibleNextStepId,

          config: {
            ...step.config,

            mode:
              nextMode,

            message:
              nextMessage,

            buttons,

            managedWaitStepId:
              null,

            waitsForCustomerResponse:
              false,
          },
        };

        onReplaceSteps(
          nextSteps
        );

        return;
      }

      const waitStepId =
        currentWait
          ?.id ||
        createWaitStepId(
          step.id,
          steps
        );

      const visibleNextStepId =
        currentWait
          ?.nextStepId ||
        (
          step.nextStepId ===
          waitStepId
            ? null
            : step.nextStepId ||
              null
        );

      const nextWaitStep:
        FlowStep = {
          id:
            waitStepId,

          type:
            "wait_for_customer_response",

          name:
            "המתנה לתשובת הלקוח",

          nextStepId:
            visibleNextStepId,

          config: {
            ...(
              currentWait
                ?.config ||
              {}
            ),

            expectedActions:
              validOptions.map(
                (
                  option
                ) =>
                  option.action
              ),

            responseOptions:
              normalizedOptions,

            promptContext: {
              question:
                nextMessage,
            },

            resolution: {
              mode:
                nextResolutionMode,

              minConfidence:
                nextMinConfidence,
            },

            hiddenInBuilder:
              true,

            managedByStepId:
              step.id,

            managedRole:
              "whatsapp_response_wait",
          },
        };

      nextSteps[
        waitStepId
      ] =
        nextWaitStep;

      nextSteps[
        step.id
      ] = {
        ...step,

        nextStepId:
          waitStepId,

        config: {
          ...step.config,

          mode:
            nextMode,

          message:
            nextMessage,

          buttons,

          managedWaitStepId:
            waitStepId,

          waitsForCustomerResponse:
            true,
        },
      };

      onReplaceSteps(
        nextSteps
      );
    };

  const updateMessage =
    (
      nextMessage: string
    ) => {
      if (
        waitForResponse ||
        mode ===
        "interactive_buttons"
      ) {
        updateManagedResponse({
          nextMessage,
        });

        return;
      }

      replaceSendOnly({
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
      if (
        nextMode ===
        "interactive_buttons"
      ) {
        updateManagedResponse({
          nextMode,

          forceWait:
            true,

          nextOptions:
            responseOptions.length >
            0
              ? responseOptions
              : [
                  {
                    action:
                      "",
                    label:
                      "",
                    description:
                      "",
                  },
                  {
                    action:
                      "",
                    label:
                      "",
                    description:
                      "",
                  },
                ],
        });

        return;
      }

      updateManagedResponse({
        nextMode:
          "text",

        forceWait:
          waitForResponse,
      });
    };

  const setWaitForResponse =
    (
      enabled: boolean
    ) => {
      updateManagedResponse({
        forceWait:
          enabled,

        nextOptions:
          enabled &&
          responseOptions.length ===
            0
            ? [
                {
                  action:
                    "",
                  label:
                    "",
                  description:
                    "",
                },
                {
                  action:
                    "",
                  label:
                    "",
                  description:
                    "",
                },
              ]
            : responseOptions,
      });
    };

  const updateOptions =
    (
      nextOptions: ReplyOption[]
    ) => {
      updateManagedResponse({
        nextOptions,
        forceWait:
          true,
      });
    };

  const addOption =
    () => {
      if (
        mode ===
          "interactive_buttons" &&
        responseOptions.length >=
          3
      ) {
        return;
      }

      updateOptions([
        ...responseOptions,

        {
          action:
            "",
          label:
            "",
          description:
            "",
        },
      ]);
    };

  const updateOption =
    (
      index: number,
      patch: Partial<ReplyOption>
    ) => {
      updateOptions(
        responseOptions.map(
          (
            option,
            optionIndex
          ) =>
            optionIndex ===
            index
              ? {
                  ...option,
                  ...patch,
                }
              : option
        )
      );
    };

  const removeOption =
    (
      index: number
    ) => {
      updateOptions(
        responseOptions.filter(
          (
            _,
            optionIndex
          ) =>
            optionIndex !==
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
    <div className="space-y-6">
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
              יכולה להיות הודעה בלבד או הודעה שממתינה לתשובה.
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
              הכפתורים וההמתנה לתשובה מנוהלים יחד באותו שלב WhatsApp.
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

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-bold text-slate-900">
              המתנה לתשובת הלקוח
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-500">
              כאשר פעיל, MagicTouch עוצר את ה־Flow עד שהלקוח עונה.
            </div>
          </div>

          <button
            type="button"
            disabled={
              mode ===
              "interactive_buttons"
            }
            className={[
              "relative h-7 w-12 rounded-full transition",
              waitForResponse
                ? "bg-blue-600"
                : "bg-slate-300",
              mode ===
              "interactive_buttons"
                ? "cursor-not-allowed opacity-70"
                : "",
            ].join(
              " "
            )}
            onClick={() =>
              setWaitForResponse(
                !waitForResponse
              )
            }
          >
            <span
              className={[
                "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition",
                waitForResponse
                  ? "right-1"
                  : "left-1",
              ].join(
                " "
              )}
            />
          </button>
        </div>

        {mode ===
        "interactive_buttons" ? (
          <div className="mt-3 text-xs font-medium text-blue-700">
            בהודעה עם כפתורים ההמתנה לתשובה פעילה אוטומטית.
          </div>
        ) : null}
      </div>

      {waitForResponse ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-bold text-slate-900">
                תשובות עסקיות אפשריות
              </div>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                ה־Action עובר ל־event.routing.resolvedAction ומשמש את שלב ה־Condition הבא.
              </p>
            </div>

            <button
              type="button"
              disabled={
                mode ===
                  "interactive_buttons" &&
                responseOptions.length >=
                  3
              }
              className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={
                addOption
              }
            >
              + תשובה
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {responseOptions.map(
              (
                option,
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
                      תשובה {index + 1}
                    </div>

                    <button
                      type="button"
                      className="text-xs font-bold text-red-600"
                      onClick={() =>
                        removeOption(
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
                        {mode ===
                        "interactive_buttons"
                          ? "מה הלקוח יראה בכפתור"
                          : "משמעות התשובה"}
                      </span>

                      <input
                        className={
                          fieldClass
                        }
                        value={
                          option.label
                        }
                        maxLength={
                          mode ===
                          "interactive_buttons"
                            ? 20
                            : undefined
                        }
                        placeholder="כן, אשמח"
                        onChange={(
                          event
                        ) =>
                          updateOption(
                            index,
                            {
                              label:
                                event.target
                                  .value,
                            }
                          )
                        }
                      />
                    </label>

                    <label>
                      <span className="mb-2 block text-xs font-semibold text-slate-600">
                        Action
                      </span>

                      <input
                        className={
                          fieldClass
                        }
                        value={
                          option.action
                        }
                        dir="ltr"
                        placeholder="booking"
                        onChange={(
                          event
                        ) =>
                          updateOption(
                            index,
                            {
                              action:
                                event.target
                                  .value,
                            }
                          )
                        }
                      />
                    </label>

                    <label className="md:col-span-2">
                      <span className="mb-2 block text-xs font-semibold text-slate-600">
                        הסבר נוסף ל־AI
                      </span>

                      <input
                        className={
                          fieldClass
                        }
                        value={
                          option.description
                        }
                        placeholder="אופציונלי"
                        onChange={(
                          event
                        ) =>
                          updateOption(
                            index,
                            {
                              description:
                                event.target
                                  .value,
                            }
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              )
            )}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                אופן זיהוי התשובה
              </span>

              <select
                className={
                  fieldClass
                }
                value={
                  resolutionMode
                }
                onChange={(
                  event
                ) =>
                  updateManagedResponse({
                    nextResolutionMode:
                      event.target
                        .value,
                  })
                }
              >
                <option value="quick_reply_only">
                  כפתורים בלבד
                </option>

                <option value="ai">
                  AI
                </option>

                <option value="ai_with_human_fallback">
                  AI עם מעבר לטיפול ידני
                </option>
              </select>
            </label>

            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                סף ביטחון
              </span>

              <input
                className={
                  fieldClass
                }
                type="number"
                min={
                  0
                }
                max={
                  1
                }
                step={
                  0.05
                }
                value={
                  minConfidence
                }
                onChange={(
                  event
                ) =>
                  updateManagedResponse({
                    nextMinConfidence:
                      Number(
                        event.target
                          .value
                      ),
                  })
                }
              />
            </label>
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
          בזמן הריצה:
          {" "}
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
