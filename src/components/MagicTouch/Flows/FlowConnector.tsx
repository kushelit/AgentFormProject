"use client";

import React, {
  useMemo,
  useState,
} from "react";

import type {
  StepType,
} from "@/lib/MagicTouch/flows/types";

import {
  FLOW_SYSTEMS,
} from "@/lib/MagicTouch/flows/flowBuilderRegistry";

import type {
  FlowSystemDefinition,
} from "@/lib/MagicTouch/flows/flowBuilderRegistry";

type Props = {
  onAdd: (type: StepType) => void;
};

export default function FlowConnector({
  onAdd,
}: Props) {
  const [open, setOpen] =
    useState(false);

  const [
    selectedSystemId,
    setSelectedSystemId,
  ] =
    useState<string | null>(null);

  const systemsWithActions =
    useMemo(
      () =>
        FLOW_SYSTEMS.filter(
          (system) =>
            system.actions.length > 0
        ),
      []
    );

  const selectedSystem:
    FlowSystemDefinition | undefined =
    useMemo(
      () =>
        systemsWithActions.find(
          (system) =>
            system.id ===
            selectedSystemId
        ),
      [
        systemsWithActions,
        selectedSystemId,
      ]
    );

  const closeModal = () => {
    setOpen(false);
    setSelectedSystemId(null);
  };

  const handleActionClick = (
    stepType:
      StepType | undefined,
    active: boolean
  ) => {
    if (
      !active ||
      !stepType
    ) {
      return;
    }

    onAdd(stepType);
    closeModal();
  };

  return (
    <>
      <div className="relative flex h-24 flex-col items-center justify-center">
        <div className="h-8 w-px bg-gradient-to-b from-slate-300 to-blue-400" />

        <button
          type="button"
          className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-4 border-slate-50 bg-blue-600 text-xl font-semibold text-white shadow-md transition hover:scale-110 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
          title="הוספת שלב"
          onClick={() =>
            setOpen(true)
          }
        >
          +
        </button>

        <div className="h-8 w-px bg-gradient-to-b from-blue-400 to-slate-300" />

        <div className="-mt-2 text-[10px] text-slate-400">
          ▼
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          dir="rtl"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
            aria-label="סגירת בחירת שלב"
            onClick={closeModal}
          />

          <section className="relative z-10 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  {selectedSystem ? (
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                      onClick={() =>
                        setSelectedSystemId(
                          null
                        )
                      }
                      title="חזרה לבחירת מערכת"
                    >
                      →
                    </button>
                  ) : null}

                  <h3 className="text-xl font-bold text-slate-900">
                    {selectedSystem
                      ? `מה לעשות ב־${selectedSystem.label}?`
                      : "איזה שלב להוסיף?"}
                  </h3>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedSystem
                    ? "בחרי את הפעולה שתתווסף למסלול."
                    : "בחרי קודם את המערכת שבה תרצי לבצע פעולה."}
                </p>
              </div>

              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-50"
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            {!selectedSystem ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {systemsWithActions.map(
                  (system) => {
                    const activeCount =
                      system.actions.filter(
                        (action) =>
                          action.active
                      ).length;

                    const plannedCount =
                      system.actions.length -
                      activeCount;

                    return (
                      <button
                        key={system.id}
                        type="button"
                        className="flex items-start gap-4 rounded-2xl border border-slate-200 p-4 text-right transition hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm"
                        onClick={() =>
                          setSelectedSystemId(
                            system.id
                          )
                        }
                      >
                        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                          {system.icon}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-slate-900">
                            {system.label}
                          </span>

                          <span className="mt-1 block text-sm text-slate-500">
                            {activeCount}{" "}
                            {activeCount === 1
                              ? "פעולה זמינה"
                              : "פעולות זמינות"}
                          </span>

                          {plannedCount >
                          0 ? (
                            <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              +{" "}
                              {
                                plannedCount
                              }{" "}
                              בפיתוח
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedSystem.actions.map(
                  (action) => {
                    const enabled =
                      action.active &&
                      Boolean(
                        action.stepType
                      );

                    return (
                      <button
                        key={action.id}
                        type="button"
                        disabled={
                          !enabled
                        }
                        className={[
                          "relative flex items-start gap-4 rounded-2xl border p-4 text-right transition",
                          enabled
                            ? "border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm"
                            : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70",
                        ].join(
                          " "
                        )}
                        onClick={() =>
                          handleActionClick(
                            action.stepType,
                            action.active
                          )
                        }
                      >
                        <span
                          className={[
                            "flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-xl",
                            enabled
                              ? "bg-slate-100"
                              : "bg-slate-200",
                          ].join(
                            " "
                          )}
                        >
                          {
                            action.icon
                          }
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {
                                action.label
                              }
                            </span>

                            {!action.active ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                                בפיתוח
                              </span>
                            ) : null}
                          </span>

                          <span className="mt-1 block text-sm leading-6 text-slate-500">
                            {
                              action.description
                            }
                          </span>
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}