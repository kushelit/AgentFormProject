"use client";

import React from "react";

import type {
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

type SourceOption = {
  action: string;
  label: string;
  description?: string;
};

type Props = {
  step: FlowStep;
  sourceOptions?: SourceOption[];
  onConfigChange: (
    patch: Record<string, unknown>
  ) => void;
};

type ResponseOption = {
  action: string;
  label: string;
  description: string;
};

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

function normalizeOptions(
  value: unknown
): ResponseOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(
    (item: any) => ({
      action:
        String(
          item?.action ||
          ""
        ).trim(),
      label:
        String(
          item?.label ||
          ""
        ).trim(),
      description:
        String(
          item?.description ||
          ""
        ).trim(),
    })
  );
}

export default function WaitForCustomerResponseStepEditor({
  step,
  sourceOptions = [],
  onConfigChange,
}: Props) {
  const options =
    normalizeOptions(
      step.config?.responseOptions
    );

  const resolution =
    step.config?.resolution &&
    typeof step.config
      .resolution ===
      "object"
      ? step.config
          .resolution as
          Record<string, unknown>
      : {};

  const mode =
    String(
      resolution.mode ||
      "ai_with_human_fallback"
    );

  const minConfidence =
    Number(
      resolution.minConfidence ??
      0.8
    );

  const question =
    String(
      (
        step.config
          ?.promptContext as
          Record<string, unknown> |
          undefined
      )?.question ||
      ""
    );

  const updateOptions =
    (
      nextOptions: ResponseOption[]
    ) => {
      onConfigChange({
        responseOptions:
          nextOptions,
        expectedActions:
          nextOptions
            .map(
              (
                option
              ) =>
                option.action
                  .trim()
            )
            .filter(
              Boolean
            ),
      });
    };

  const addOption =
    () => {
      updateOptions([
        ...options,
        {
          action: "",
          label: "",
          description: "",
        },
      ]);
    };

  const updateOption =
    (
      index: number,
      patch: Partial<ResponseOption>
    ) => {
      updateOptions(
        options.map(
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
        options.filter(
          (
            _,
            optionIndex
          ) =>
            optionIndex !==
            index
        )
      );
    };

  const syncFromPreviousButtons =
    () => {
      const nextOptions =
        sourceOptions
          .filter(
            (
              option
            ) =>
              Boolean(
                option.action
              )
          )
          .map(
            (
              option
            ) => ({
              action:
                option.action,
              label:
                option.label ||
                option.action,
              description:
                option.description ||
                "",
            }));

      updateOptions(
        nextOptions
      );
    };

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          השאלה שהלקוח מתבקש לענות עליה
        </span>

        <textarea
          rows={
            3
          }
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          value={
            question
          }
          onChange={(
            event
          ) =>
            onConfigChange({
              promptContext: {
                question:
                  event.target.value,
              },
            })
          }
        />
      </label>

      {sourceOptions.length >
      0 ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-blue-900">
                נמצאו כפתורי תשובה בהודעה הקודמת
              </div>

              <div className="mt-1 text-sm text-blue-700">
                אפשר להשתמש באותם Actions אוטומטית גם בשלב ההמתנה.
              </div>
            </div>

            <button
              type="button"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
              onClick={
                syncFromPreviousButtons
              }
            >
              סנכרון מהכפתורים
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {sourceOptions.map(
              (
                option
              ) => (
                <span
                  key={
                    option.action
                  }
                  className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800"
                >
                  {option.label ||
                    option.action}
                  {" → "}
                  <span dir="ltr">
                    {option.action}
                  </span>
                </span>
              )
            )}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-slate-900">
              תשובות עסקיות אפשריות
            </div>
            <div className="mt-1 text-sm text-slate-500">
              ה־AI ממפה מלל חופשי של הלקוח לפעולות האלו.
            </div>
          </div>

          <button
            type="button"
            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
            onClick={
              addOption
            }
          >
            + תשובה
          </button>
        </div>

        <div className="space-y-3">
          {options.map(
            (
              option,
              index
            ) => (
              <div
                key={
                  `${index}_${option.action}`
                }
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">
                    אפשרות {index + 1}
                  </span>

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
                      Action
                    </span>

                    <input
                      className={fieldClass}
                      dir="ltr"
                      value={
                        option.action
                      }
                      placeholder="booking"
                      onChange={(
                        event
                      ) =>
                        updateOption(
                          index,
                          {
                            action:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-semibold text-slate-600">
                      משמעות ללקוח
                    </span>

                    <input
                      className={fieldClass}
                      value={
                        option.label
                      }
                      placeholder="מעוניין לקבוע מועד חדש"
                      onChange={(
                        event
                      ) =>
                        updateOption(
                          index,
                          {
                            label:
                              event
                                .target
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
                      className={fieldClass}
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
                              event
                                .target
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
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            אופן זיהוי התשובה
          </span>

          <select
            className={fieldClass}
            value={
              mode
            }
            onChange={(
              event
            ) =>
              onConfigChange({
                resolution: {
                  ...resolution,
                  mode:
                    event.target
                      .value,
                  minConfidence,
                },
              })
            }
          >
            <option value="quick_reply_only">
              Quick Reply בלבד
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
            className={fieldClass}
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
              onConfigChange({
                resolution: {
                  ...resolution,
                  mode,
                  minConfidence:
                    Number(
                      event
                        .target
                        .value
                    ),
                },
              })
            }
          />
        </label>
      </div>
    </div>
  );
}
