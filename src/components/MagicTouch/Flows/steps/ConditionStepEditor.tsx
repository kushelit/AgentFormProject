"use client";

import React from "react";

import type {
  FlowBranch,
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
  stepIds: string[];
  steps: Record<string, FlowStep>;
  onConfigChange: (
    patch: Record<string, unknown>
  ) => void;
};

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

function normalizeBranches(
  value: unknown
): FlowBranch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(
    (item: any, index) => ({
      id:
        String(
          item?.id ||
          `branch_${index + 1}`
        ).trim(),
      value:
        String(
          item?.value ||
          ""
        ).trim(),
      label:
        String(
          item?.label ||
          item?.value ||
          ""
        ).trim(),
      nextStepId:
        String(
          item?.nextStepId ||
          ""
        ).trim() ||
        null,
    })
  );
}

function createBranchId(
  branches: FlowBranch[]
): string {
  let index = 1;
  let id = `branch_${index}`;

  const existing =
    new Set(
      branches.map(
        (branch) =>
          branch.id
      )
    );

  while (
    existing.has(id)
  ) {
    index += 1;
    id = `branch_${index}`;
  }

  return id;
}

export default function ConditionStepEditor({
  step,
  sourceOptions = [],
  stepIds,
  steps,
  onConfigChange,
}: Props) {
  const field =
    String(
      step.config?.field ||
      "event.routing.resolvedAction"
    );

  const branches =
    normalizeBranches(
      step.config?.branches
    );

  const fallbackStepId =
    String(
      step.config?.fallbackStepId ||
      ""
    );

  const updateBranches =
    (
      nextBranches: FlowBranch[]
    ) => {
      onConfigChange({
        branches:
          nextBranches,
      });
    };

  const updateBranch =
    (
      branchId: string,
      patch: Partial<FlowBranch>
    ) => {
      updateBranches(
        branches.map(
          (branch) =>
            branch.id ===
            branchId
              ? {
                  ...branch,
                  ...patch,
                }
              : branch
        )
      );
    };

  const addBranch =
    () => {
      const id =
        createBranchId(
          branches
        );

      updateBranches([
        ...branches,
        {
          id,
          value: "",
          label: "",
          nextStepId: null,
        },
      ]);
    };

  const removeBranch =
    (
      branchId: string
    ) => {
      updateBranches(
        branches.filter(
          (branch) =>
            branch.id !==
            branchId
        )
      );
    };

  const syncFromPreviousWait =
    () => {
      const existingTargets =
        new Map(
          branches.map(
            (
              branch
            ) => [
              branch.value,
              branch.nextStepId,
            ]
          )
        );

      const nextBranches =
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
              option,
              index
            ) => ({
              id:
                option.action ||
                `branch_${index + 1}`,
              value:
                option.action,
              label:
                option.label ||
                option.action,
              nextStepId:
                existingTargets.get(
                  option.action
                ) ||
                null,
            }));

      onConfigChange({
        field:
          "event.routing.resolvedAction",
        branches:
          nextBranches,
      });
    };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        השלב בודק ערך אחד בזמן הריצה וממשיך לענף
        שמתאים לערך שלו. במקרה של תשובת לקוח,
        השדה המומלץ הוא
        <span
          className="mx-1 font-mono font-bold"
          dir="ltr"
        >
          event.routing.resolvedAction
        </span>
        .
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          שדה לניתוב
        </span>

        <input
          className={fieldClass}
          value={field}
          dir="ltr"
          onChange={(
            event
          ) =>
            onConfigChange({
              field:
                event.target.value,
            })
          }
        />
      </label>

      {sourceOptions.length >
      0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-emerald-900">
                נמצאו תשובות בשלב ההמתנה הקודם
              </div>

              <div className="mt-1 text-sm text-emerald-700">
                אפשר ליצור או לסנכרן את הענפים אוטומטית מאותם Actions.
              </div>
            </div>

            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              onClick={
                syncFromPreviousWait
              }
            >
              סנכרון ענפים מהתשובות
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
                  className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-800"
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
              ענפים
            </div>
            <div className="mt-1 text-sm text-slate-500">
              לכל ערך מגדירים לאיזה שלב ממשיכים.
            </div>
          </div>

          <button
            type="button"
            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
            onClick={
              addBranch
            }
          >
            + הוספת ענף
          </button>
        </div>

        <div className="space-y-3">
          {branches.length ===
          0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
              עדיין לא הוגדרו ענפים.
            </div>
          ) : null}

          {branches.map(
            (
              branch,
              index
            ) => (
              <div
                key={
                  branch.id
                }
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-slate-900">
                    ענף {index + 1}
                  </div>

                  <button
                    type="button"
                    className="text-xs font-bold text-red-600 hover:text-red-700"
                    onClick={() =>
                      removeBranch(
                        branch.id
                      )
                    }
                  >
                    מחיקה
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-xs font-semibold text-slate-600">
                      ערך
                    </span>

                    <input
                      className={fieldClass}
                      value={
                        branch.value
                      }
                      dir="ltr"
                      placeholder="booking"
                      onChange={(
                        event
                      ) =>
                        updateBranch(
                          branch.id,
                          {
                            value:
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
                      שם שיוצג בקנבס
                    </span>

                    <input
                      className={fieldClass}
                      value={
                        branch.label
                      }
                      placeholder="מעוניין לתאם"
                      onChange={(
                        event
                      ) =>
                        updateBranch(
                          branch.id,
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
                      המשך לענף
                    </span>

                    <select
                      className={fieldClass}
                      value={
                        branch.nextStepId ||
                        ""
                      }
                      onChange={(
                        event
                      ) =>
                        updateBranch(
                          branch.id,
                          {
                            nextStepId:
                              event
                                .target
                                .value ||
                              null,
                          }
                        )
                      }
                    >
                      <option value="">
                        ללא שלב מחובר
                      </option>

                      {stepIds
                        .filter(
                          (
                            candidateId
                          ) =>
                            candidateId !==
                            step.id
                        )
                        .map(
                          (
                            candidateId
                          ) => (
                            <option
                              key={
                                candidateId
                              }
                              value={
                                candidateId
                              }
                            >
                              {steps[
                                candidateId
                              ]?.name ||
                                candidateId}
                            </option>
                          )
                        )}
                    </select>
                  </label>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          מסלול ברירת מחדל
        </span>

        <select
          className={fieldClass}
          value={
            fallbackStepId
          }
          onChange={(
            event
          ) =>
            onConfigChange({
              fallbackStepId:
                event.target
                  .value ||
                null,
            })
          }
        >
          <option value="">
            ללא מסלול ברירת מחדל
          </option>

          {stepIds
            .filter(
              (
                candidateId
              ) =>
                candidateId !==
                step.id
            )
            .map(
              (
                candidateId
              ) => (
                <option
                  key={
                    candidateId
                  }
                  value={
                    candidateId
                  }
                >
                  {steps[
                    candidateId
                  ]?.name ||
                    candidateId}
                </option>
              )
            )}
        </select>

        <span className="mt-2 block text-xs text-slate-400">
          אם שום ענף לא מתאים ואין ברירת מחדל,
          הריצה תסתיים.
        </span>
      </label>
    </div>
  );
}
