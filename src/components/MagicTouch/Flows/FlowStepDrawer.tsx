"use client";

import React, {
  useEffect,
} from "react";

import type {
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

import UpdateContactStepEditor from
  "@/components/MagicTouch/Flows/steps/UpdateContactStepEditor";

import TimelineStepEditor from
  "@/components/MagicTouch/Flows/steps/TimelineStepEditor";

import SurenseActivityStepEditor from
  "@/components/MagicTouch/Flows/steps/SurenseActivityStepEditor";

import CreateSurensePowerOfAttorneyStepEditor from
  "@/components/MagicTouch/Flows/steps/CreateSurensePowerOfAttorneyStepEditor";

import RequestDocumentsStepEditor from
  "@/components/MagicTouch/Flows/steps/RequestDocumentsStepEditor";

import SendWhatsAppStepEditor from
  "@/components/MagicTouch/Flows/steps/SendWhatsAppStepEditor";

import SendBookingLinkStepEditor from
  "@/components/MagicTouch/Flows/steps/SendBookingLinkStepEditor";

import SendGoogleBookingLinkStepEditor from
  "@/components/MagicTouch/Flows/steps/SendGoogleBookingLinkStepEditor";

import ConditionStepEditor from
  "@/components/MagicTouch/Flows/steps/ConditionStepEditor";

import WaitForCustomerResponseStepEditor from
  "@/components/MagicTouch/Flows/steps/WaitForCustomerResponseStepEditor";

import {
  getStepIcon,
  getStepTypeLabel,
} from "./FlowStepSummary";

import {
  getSystemForStepType,
} from "@/lib/MagicTouch/flows/flowBuilderRegistry";

type Props = {
  open: boolean;
  step: FlowStep | null;
  stepIds: string[];
  steps: Record<string, FlowStep>;
  onClose: () => void;
  onUpdateStep: (
    stepId: string,
    patch: Partial<FlowStep>
  ) => void;
  onUpdateConfig: (
    stepId: string,
    patch: Record<string, unknown>
  ) => void;
};

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

type ResponseOptionSeed = {
  action: string;
  label: string;
  description: string;
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function findLinearPreviousStep(
  currentStepId: string,
  steps: Record<string, FlowStep>
): FlowStep | null {
  return (
    Object.values(
      steps
    ).find(
      (
        candidate
      ) =>
        candidate.nextStepId ===
        currentStepId
    ) ||
    null
  );
}

function getPreviousInteractiveButtons(
  currentStepId: string,
  steps: Record<string, FlowStep>
): ResponseOptionSeed[] {
  const previousStep =
    findLinearPreviousStep(
      currentStepId,
      steps
    );

  if (
    !previousStep ||
    previousStep.type !==
      "send_whatsapp" ||
    s(
      previousStep.config
        ?.mode
    ) !==
      "interactive_buttons"
  ) {
    return [];
  }

  const rawButtons =
    previousStep.config
      ?.buttons;

  if (
    !Array.isArray(
      rawButtons
    )
  ) {
    return [];
  }

  return rawButtons
    .map(
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
    )
    .filter(
      (
        option
      ) =>
        Boolean(
          option.action
        )
    );
}

function getPreviousWaitOptions(
  currentStepId: string,
  steps: Record<string, FlowStep>
): ResponseOptionSeed[] {
  const previousStep =
    findLinearPreviousStep(
      currentStepId,
      steps
    );

  if (
    !previousStep ||
    previousStep.type !==
      "wait_for_customer_response"
  ) {
    return [];
  }

  const rawOptions =
    previousStep.config
      ?.responseOptions;

  if (
    Array.isArray(
      rawOptions
    )
  ) {
    const options =
      rawOptions
        .map(
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
              ) ||
              s(
                option?.action
              ),
            description:
              s(
                option?.description
              ),
          })
        )
        .filter(
          (
            option
          ) =>
            Boolean(
              option.action
            )
        );

    if (
      options.length >
      0
    ) {
      return options;
    }
  }

  const rawExpectedActions =
    previousStep.config
      ?.expectedActions;

  if (
    !Array.isArray(
      rawExpectedActions
    )
  ) {
    return [];
  }

  return rawExpectedActions
    .map(
      (
        action
      ) => {
        const normalizedAction =
          s(
            action
          );

        return {
          action:
            normalizedAction,
          label:
            normalizedAction,
          description:
            "",
        };
      }
    )
    .filter(
      (
        option
      ) =>
        Boolean(
          option.action
        )
    );
}

export default function FlowStepDrawer({
  open,
  step,
  stepIds,
  steps,
  onClose,
  onUpdateStep,
  onUpdateConfig,
}: Props) {
  useEffect(
    () => {
      if (
        !open
      ) {
        return;
      }

      const handler =
        (
          event: KeyboardEvent
        ) => {
          if (
            event.key ===
            "Escape"
          ) {
            onClose();
          }
        };

      document.body.style.overflow =
        "hidden";

      window.addEventListener(
        "keydown",
        handler
      );

      return () => {
        document.body.style.overflow =
          "";

        window.removeEventListener(
          "keydown",
          handler
        );
      };
    },
    [
      open,
      onClose,
    ]
  );

  if (
    !open ||
    !step
  ) {
    return null;
  }

  const stepId =
    step.id;

  const stepSystem =
    getSystemForStepType(
      step.type
    );

  const stepAction =
    stepSystem
      ?.actions
      .find(
        (
          action
        ) =>
          action.stepType ===
          step.type
      );

  const hasLinearNextStep =
    step.type !==
      "end" &&
    step.type !==
      "condition";

  const previousInteractiveButtons =
    getPreviousInteractiveButtons(
      stepId,
      steps
    );

  const previousWaitOptions =
    getPreviousWaitOptions(
      stepId,
      steps
    );

  return (
    <div
      className="fixed inset-0 z-[60]"
      dir="rtl"
    >
      <button
        type="button"
        aria-label="סגירת עורך השלב"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
        onClick={
          onClose
        }
      />

      <aside className="absolute inset-y-0 left-0 flex w-full max-w-3xl flex-col bg-slate-50 shadow-2xl">
        <header className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-xl">
                {getStepIcon(
                  step
                )}
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {stepSystem ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      <span>
                        {stepSystem.icon}
                      </span>
                      <span>
                        {stepSystem.label}
                      </span>
                    </span>
                  ) : null}

                  <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {stepAction
                      ?.label ||
                      getStepTypeLabel(
                        step
                      )}
                  </span>
                </div>

                <h2 className="text-xl font-bold text-slate-900">
                  {step.name ||
                    "עריכת שלב"}
                </h2>

                <p
                  className="mt-1 text-xs text-slate-400"
                  dir="ltr"
                >
                  {step.id}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 hover:bg-slate-50"
              onClick={
                onClose
              }
            >
              ×
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-bold text-slate-900">
                פרטי השלב
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    שם השלב
                  </span>

                  <input
                    className={
                      fieldClass
                    }
                    value={
                      step.name
                    }
                    onChange={(
                      event
                    ) =>
                      onUpdateStep(
                        stepId,
                        {
                          name:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                  />
                </label>

                {hasLinearNextStep ? (
                  <label>
                    <span className="mb-2 block text-sm font-semibold text-slate-700">
                      השלב הבא
                    </span>

                    <select
                      className={
                        fieldClass
                      }
                      value={
                        step
                          .nextStepId ||
                        ""
                      }
                      onChange={(
                        event
                      ) =>
                        onUpdateStep(
                          stepId,
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
                        ללא שלב הבא
                      </option>

                      {stepIds
                        .filter(
                          (
                            candidateId
                          ) =>
                            candidateId !==
                            stepId
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
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-1 font-bold text-slate-900">
                הגדרות הפעולה
              </h3>

              <p className="mb-5 text-sm text-slate-500">
                הגדירי מה יקרה כאשר המערכת תגיע לשלב הזה.
              </p>

              {step.type ===
              "send_whatsapp" ? (
                <SendWhatsAppStepEditor
                  step={
                    step
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "wait_for_customer_response" ? (
                <WaitForCustomerResponseStepEditor
                  step={
                    step
                  }
                  sourceOptions={
                    previousInteractiveButtons
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "condition" ? (
                <ConditionStepEditor
                  step={
                    step
                  }
                  sourceOptions={
                    previousWaitOptions
                  }
                  stepIds={
                    stepIds
                  }
                  steps={
                    steps
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "send_booking_link" ? (
                <SendBookingLinkStepEditor
                  step={
                    step
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "send_google_booking_link" ? (
                <SendGoogleBookingLinkStepEditor
                  step={
                    step
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "update_contact" ? (
                <UpdateContactStepEditor
                  step={
                    step
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "add_timeline_event" ? (
                <TimelineStepEditor
                  step={
                    step
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "sync_surense_activity" ? (
                <SurenseActivityStepEditor
                  step={
                    step
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "request_documents" ? (
                <RequestDocumentsStepEditor
                  step={
                    step
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "create_surense_power_of_attorney" ? (
                <CreateSurensePowerOfAttorneyStepEditor
                  step={
                    step
                  }
                  onConfigChange={(
                    patch
                  ) =>
                    onUpdateConfig(
                      stepId,
                      patch
                    )
                  }
                />
              ) : null}

              {step.type ===
              "end" ? (
                <label>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    הערת סיום פנימית
                  </span>

                  <input
                    className={
                      fieldClass
                    }
                    value={
                      String(
                        step.config
                          ?.message ||
                        ""
                      )
                    }
                    onChange={(
                      event
                    ) =>
                      onUpdateConfig(
                        stepId,
                        {
                          message:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                    placeholder="לדוגמה: התהליך הסתיים בהצלחה"
                  />

                  <span className="mt-2 block text-xs text-slate-400">
                    ההערה נשמרת בריצת התהליך בלבד ואינה נשלחת ללקוח.
                  </span>
                </label>
              ) : null}
            </section>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
            onClick={
              onClose
            }
          >
            סגירה
          </button>

          <button
            type="button"
            className="rounded-xl bg-blue-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-700"
            onClick={
              onClose
            }
          >
            סיום עריכה
          </button>
        </footer>
      </aside>
    </div>
  );
}
