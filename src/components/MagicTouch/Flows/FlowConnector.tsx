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

type Props = {
  onAdd: (
    type: StepType
  ) => void;
};

type PickerAction = {
  value: StepType;
  label: string;
  description: string;
  icon: string;
};

export default function FlowConnector({
  onAdd,
}: Props) {
  const [
    open,
    setOpen,
  ] =
    useState(
      false
    );

  const [
    selectedSystemId,
    setSelectedSystemId,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const systems =
    useMemo(
      () =>
        FLOW_SYSTEMS
          .map(
            (
              system
            ) => ({
              ...system,

              pickerActions:
                system.actions
                  .filter(
                    (
                      action
                    ) =>
                      action.active &&
                      Boolean(
                        action.stepType
                      )
                  )
                  .map(
                    (
                      action
                    ) => ({
                      value:
                        action.stepType!,

                      label:
                        action.label,

                      description:
                        action.description,

                      icon:
                        action.icon,
                    } as PickerAction
                  )),
            })
          )
          .filter(
            (
              system
            ) =>
              system
                .pickerActions
                .length >
              0
          ),
      []
    );

  const selectedSystem =
    systems.find(
      (
        system
      ) =>
        system.id ===
        selectedSystemId
    ) ||
    null;

  const close =
    () => {
      setOpen(
        false
      );

      setSelectedSystemId(
        null
      );
    };

  const chooseAction =
    (
      value: StepType
    ) => {
      onAdd(
        value
      );

      close();
    };

  return (
    <>
      <div className="relative flex h-20 flex-col items-center justify-center">
        <div className="h-5 w-px bg-gradient-to-b from-slate-300 to-blue-300" />

        <button
          type="button"
          className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-xl font-semibold text-white shadow-md transition hover:scale-110 hover:bg-blue-700"
          title="הוספת שלב"
          onClick={() =>
            setOpen(
              true
            )
          }
        >
          +
        </button>

        <div className="h-5 w-px bg-gradient-to-b from-blue-300 to-slate-300" />
        <div className="-mt-1 text-xs text-slate-400">
          ▼
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
          dir="rtl"
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="סגירת חלון הוספת שלב"
            onClick={
              close
            }
          />

          <section className="relative z-10 w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  איזה שלב להוסיף?
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  בחרי קודם את המערכת שבה תרצי לבצע פעולה.
                </p>
              </div>

              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-slate-500 hover:bg-slate-100"
                onClick={
                  close
                }
              >
                ×
              </button>
            </div>

            {!selectedSystem ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {systems.map(
                  (
                    system
                  ) => (
                    <button
                      type="button"
                      key={
                        system.id
                      }
                      className="flex items-center gap-4 rounded-2xl border border-slate-200 p-5 text-right transition hover:border-blue-300 hover:bg-blue-50/40"
                      onClick={() =>
                        setSelectedSystemId(
                          system.id
                        )
                      }
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                        {system.icon}
                      </div>

                      <div>
                        <div className="font-bold text-slate-900">
                          {system.label}
                        </div>

                        <div className="mt-1 text-sm text-slate-500">
                          {system
                            .pickerActions
                            .length}{" "}
                          פעולות זמינות
                        </div>
                      </div>
                    </button>
                  )
                )}
              </div>
            ) : (
              <div className="mt-6">
                <button
                  type="button"
                  className="mb-4 text-sm font-bold text-blue-700"
                  onClick={() =>
                    setSelectedSystemId(
                      null
                    )
                  }
                >
                  → חזרה למערכות
                </button>

                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xl">
                    {selectedSystem.icon}
                  </div>

                  <div>
                    <div className="text-lg font-bold text-slate-900">
                      {selectedSystem.label}
                    </div>

                    <div className="text-sm text-slate-500">
                      בחרי פעולה להוספה למסלול
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {selectedSystem
                    .pickerActions
                    .map(
                      (
                        action
                      ) => (
                        <button
                          type="button"
                          key={
                            action.value
                          }
                          className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-blue-300 hover:bg-blue-50/40"
                          onClick={() =>
                            chooseAction(
                              action.value
                            )
                          }
                        >
                          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-slate-100 text-xl">
                            {action.icon}
                          </div>

                          <div>
                            <div className="font-bold text-slate-900">
                              {action.label}
                            </div>

                            <div className="mt-1 text-xs leading-5 text-slate-500">
                              {action.description}
                            </div>
                          </div>
                        </button>
                      )
                    )}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
