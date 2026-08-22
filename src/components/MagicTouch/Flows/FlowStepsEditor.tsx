"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FlowBranch,
  FlowDocument,
  FlowStep,
  StepType,
} from "@/lib/MagicTouch/flows/types";

import FlowConnector from "./FlowConnector";
import FlowStepDrawer from "./FlowStepDrawer";
import FlowBranchCanvas from "./FlowBranchCanvas";

type Props = {
  value: FlowDocument;
  onChange: (
    value: FlowDocument
  ) => void;
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function createStepId(
  type: StepType,
  existing: Record<string, FlowStep>
): string {
  let index = 1;
  let id =
    `${type}_${index}`;

  while (
    existing[
      id
    ]
  ) {
    index += 1;
    id =
      `${type}_${index}`;
  }

  return id;
}

function createDefaultStep(
  id: string,
  type: StepType
): FlowStep {
  switch (
    type
  ) {
    case "condition":
      return {
        id,
        type,
        name:
          "ניתוב לפי תשובת הלקוח",
        nextStepId:
          null,
        config: {
          field:
            "event.routing.resolvedAction",
          branches: [],
          fallbackStepId:
            null,
        },
      };

    case "wait_for_customer_response":
      return {
        id,
        type,
        name:
          "המתנה לתשובת הלקוח",
        nextStepId:
          null,
        config: {
          expectedActions: [],
          responseOptions: [],
          promptContext: {
            question:
              "",
          },
          resolution: {
            mode:
              "ai_with_human_fallback",
            minConfidence:
              0.8,
          },
        },
      };

    case "request_documents":
      return {
        id,
        type,
        name:
          "בקשת צילום תעודת זהות",
        nextStepId:
          null,
        config: {
          documentSet:
            "identity_card_both_sides",
          waitForCompletion:
            true,
          message:
            "לצורך הכנת התהליך, יש להעלות צילום ברור של שני צדי תעודת הזהות בקישור המאובטח הבא:\n\n{{uploadUrl}}",
        },
      };

    case "send_whatsapp":
      return {
        id,
        type,
        name:
          "שליחת הודעת WhatsApp",
        nextStepId:
          null,
        config: {
          mode:
            "text",
          message:
            "",
          waitsForCustomerResponse:
            false,
          managedWaitStepId:
            null,
        },
      };

    case "send_booking_link":
      return {
        id,
        type,
        name:
          "שליחת קישור לפגישת Bookings",
        nextStepId:
          null,
        config: {
          messageBefore:
            "מעולה, נשמח לתאם פגישה.\nניתן לבחור מועד שנוח לך בקישור הבא:",
          messageAfter:
            "",
          bookingSource:
            "default_service",
        },
      };

    case "send_google_booking_link":
      return {
        id,
        type,
        name:
          "שליחת קישור לפגישה ב־Google Calendar",
        nextStepId:
          null,
        config: {
          messageBefore:
            "מעולה, נשמח לתאם פגישה.\nניתן לבחור מועד שנוח לך בקישור הבא:",
          messageAfter:
            "",
          bookingSource:
            "default_booking_url",
        },
      };

    case "update_contact":
      return {
        id,
        type,
        name:
          "עדכון איש קשר",
        nextStepId:
          null,
        config: {
          updates: {
            "engagement.reengagement.lastFlowRunId":
              "{{run.runId}}",
            "engagement.reengagement.updatedAt":
              "{{nowTimestamp}}",
          },
        },
      };

    case "add_timeline_event":
      return {
        id,
        type,
        name:
          "הוספה לציר הזמן",
        nextStepId:
          null,
        config: {
          eventType:
            "magic_touch_flow_action",
          title:
            "",
          description:
            "",
        },
      };

    case "sync_surense_activity":
      return {
        id,
        type,
        name:
          "עדכון פעילות בשורנס",
        nextStepId:
          null,
        config: {
          activityType:
            "",
          workflowStatus:
            "closed",
          note:
            "",
        },
      };

    case "create_surense_power_of_attorney":
      return {
        id,
        type,
        name:
          "יצירת קישור ייפוי כוח",
        nextStepId:
          null,
        config: {
          includeHb:
            true,
          includePolicies:
            true,
          includeSwiftness:
            true,
          statusPath:
            "engagement.reengagement.powerOfAttorney",
        },
      };

    case "end":
      return {
        id,
        type,
        name:
          "סיום",
        config: {
          message:
            "",
        },
      };

    default:
      return {
        id,
        type,
        name:
          "שלב חדש",
        nextStepId:
          null,
        config: {},
      };
  }
}

function getBranches(
  step: FlowStep
): FlowBranch[] {
  const raw =
    step.config
      ?.branches;

  if (
    !Array.isArray(
      raw
    )
  ) {
    return [];
  }

  return raw.map(
    (
      branch: any,
      index
    ) => ({
      id:
        s(
          branch?.id
        ) ||
        `branch_${index + 1}`,
      value:
        s(
          branch?.value
        ),
      label:
        s(
          branch?.label
        ) ||
        s(
          branch?.value
        ),
      nextStepId:
        s(
          branch
            ?.nextStepId
        ) ||
        null,
    })
  );
}

type ResponseOptionSeed = {
  action: string;
  label: string;
  description: string;
};

function isHiddenManagedWait(
  step: FlowStep | undefined
): boolean {
  return Boolean(
    step &&
    step.type ===
      "wait_for_customer_response" &&
    step.config
      ?.hiddenInBuilder ===
      true &&
    s(
      step.config
        ?.managedRole
    ) ===
      "whatsapp_response_wait"
  );
}

function getManagedWaitStep(
  step: FlowStep | undefined,
  steps: Record<string, FlowStep>
): FlowStep | null {
  if (
    !step ||
    step.type !==
      "send_whatsapp"
  ) {
    return null;
  }

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
    !isHiddenManagedWait(
      waitStep
    )
  ) {
    return null;
  }

  return waitStep;
}

function getWaitResponseOptions(
  step: FlowStep | null | undefined
): ResponseOptionSeed[] {
  if (
    !step ||
    step.type !==
      "wait_for_customer_response"
  ) {
    return [];
  }

  const rawOptions =
    step.config
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
    step.config
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

function createBranchesFromOptions(
  options: ResponseOptionSeed[]
): FlowBranch[] {
  const usedIds =
    new Set<string>();

  return options.map(
    (
      option,
      index
    ) => {
      const baseId =
        option.action ||
        `branch_${index + 1}`;

      let id =
        baseId;

      let suffix =
        2;

      while (
        usedIds.has(
          id
        )
      ) {
        id =
          `${baseId}_${suffix}`;

        suffix +=
          1;
      }

      usedIds.add(
        id
      );

      return {
        id,
        value:
          option.action,
        label:
          option.label ||
          option.action,
        nextStepId:
          null,
      };
    }
  );
}

function applyContextDefaultsToNewStep({
  newStep,
  previousStep,
}: {
  newStep: FlowStep;
  previousStep: FlowStep | null;
}): FlowStep {
  if (
    newStep.type !==
      "condition"
  ) {
    return newStep;
  }

  const waitOptions =
    getWaitResponseOptions(
      previousStep
    );

  if (
    waitOptions.length ===
    0
  ) {
    return newStep;
  }

  return {
    ...newStep,
    config: {
      ...newStep.config,
      field:
        "event.routing.resolvedAction",
      branches:
        createBranchesFromOptions(
          waitOptions
        ),
    },
  };
}

function getVisibleStepIds(
  steps: Record<string, FlowStep>
): string[] {
  return Object.keys(
    steps
  ).filter(
    (
      stepId
    ) =>
      !isHiddenManagedWait(
        steps[
          stepId
        ]
      )
  );
}

function getReachableStepIds(
  flow: FlowDocument
): Set<string> {
  const reachable =
    new Set<string>();

  const visit =
    (
      stepId: string
    ) => {
      if (
        !stepId ||
        reachable.has(
          stepId
        ) ||
        !flow.steps[
          stepId
        ]
      ) {
        return;
      }

      reachable.add(
        stepId
      );

      const step =
        flow.steps[
          stepId
        ];

      if (
        step.type ===
        "condition"
      ) {
        for (
          const branch of
          getBranches(
            step
          )
        ) {
          if (
            branch.nextStepId
          ) {
            visit(
              branch.nextStepId
            );
          }
        }

        const fallbackStepId =
          s(
            step.config
              ?.fallbackStepId
          );

        if (
          fallbackStepId
        ) {
          visit(
            fallbackStepId
          );
        }

        return;
      }

      const nextStepId =
        s(
          step.nextStepId
        );

      if (
        nextStepId
      ) {
        visit(
          nextStepId
        );
      }
    };

  visit(
    flow.firstStepId
  );

  return reachable;
}

function triggerLabel(
  type: string
): string {
  switch (
    type
  ) {
    case "whatsapp_quick_reply_received":
      return "לחיצה על כפתור WhatsApp";
    case "whatsapp_message_received":
      return "התקבלה הודעת WhatsApp";
    case "microsoft_booking_created":
      return "נקבעה פגישה ב־Microsoft Bookings";
    case "microsoft_booking_cancelled":
      return "בוטלה פגישה ב־Microsoft Bookings";
    case "google_booking_created":
      return "נקבעה פגישה ב־Google Calendar";
    case "google_booking_cancelled":
      return "בוטלה פגישה ב־Google Calendar";
    case "reengagement_message_sent":
      return "נשלחה הודעת חידוש קשר";
    case "manual":
      return "הפעלה ידנית";
    default:
      return type ||
        "לא הוגדר טריגר";
  }
}

export default function FlowStepsEditor({
  value,
  onChange,
}: Props) {
  const steps =
    value.steps;

  const [
    selectedStepId,
    setSelectedStepId,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  useEffect(
    () => {
      if (
        selectedStepId &&
        !steps[
          selectedStepId
        ]
      ) {
        setSelectedStepId(
          null
        );
      }
    },
    [
      selectedStepId,
      steps,
    ]
  );

  const reachableStepIds =
    useMemo(
      () =>
        getReachableStepIds(
          value
        ),
      [
        value,
      ]
    );

  const disconnectedIds =
    useMemo(
      () =>
        getVisibleStepIds(
          steps
        ).filter(
          (
            stepId
          ) =>
            !reachableStepIds.has(
              stepId
            )
        ),
      [
        steps,
        reachableStepIds,
      ]
    );

  const updateStep =
    (
      stepId: string,
      patch: Partial<FlowStep>
    ) => {
      onChange({
        ...value,
        steps: {
          ...steps,
          [
            stepId
          ]: {
            ...steps[
              stepId
            ],
            ...patch,
          },
        },
      });
    };

  const updateConfig =
    (
      stepId: string,
      patch: Record<string, unknown>
    ) => {
      updateStep(
        stepId,
        {
          config: {
            ...steps[
              stepId
            ].config,
            ...patch,
          },
        }
      );
    };

  const replaceSteps =
    (
      nextSteps: Record<string, FlowStep>
    ) => {
      onChange({
        ...value,
        steps:
          nextSteps,
      });
    };

  const addLinearStep =
    (
      afterStepId: string | null,
      type: StepType
    ) => {
      const stepId =
        createStepId(
          type,
          steps
        );

      const defaultStep =
        createDefaultStep(
          stepId,
          type
        );

      const visiblePreviousStep =
        afterStepId
          ? steps[
              afterStepId
            ] ||
            null
          : null;

      const managedWait =
        visiblePreviousStep
          ? getManagedWaitStep(
              visiblePreviousStep,
              steps
            )
          : null;

      const effectivePreviousStep =
        managedWait ||
        visiblePreviousStep;

      const newStep =
        applyContextDefaultsToNewStep({
          newStep:
            defaultStep,
          previousStep:
            effectivePreviousStep,
        });

      const nextSteps = {
        ...steps,
      };

      if (
        !afterStepId
      ) {
        const previousFirstStepId =
          value.firstStepId ||
          null;

        nextSteps[
          stepId
        ] = {
          ...newStep,
          ...(
            type !==
            "end"
              ? {
                  nextStepId:
                    previousFirstStepId,
                }
              : {}
          ),
        };

        onChange({
          ...value,
          firstStepId:
            stepId,
          steps:
            nextSteps,
        });

        setSelectedStepId(
          stepId
        );

        return;
      }

      if (
        !effectivePreviousStep ||
        effectivePreviousStep.type ===
          "condition"
      ) {
        return;
      }

      const previousNextStepId =
        effectivePreviousStep
          .nextStepId ||
        null;

      nextSteps[
        effectivePreviousStep.id
      ] = {
        ...effectivePreviousStep,
        nextStepId:
          stepId,
      };

      nextSteps[
        stepId
      ] = {
        ...newStep,
        ...(
          type !==
          "end"
            ? {
                nextStepId:
                  previousNextStepId,
              }
            : {}
        ),
      };

      onChange({
        ...value,
        firstStepId:
          value.firstStepId ||
          stepId,
        steps:
          nextSteps,
      });

      setSelectedStepId(
        stepId
      );
    };

  const addBranchStep =
    (
      conditionStepId: string,
      branchId: string,
      type: StepType
    ) => {
      const conditionStep =
        steps[
          conditionStepId
        ];

      if (
        !conditionStep ||
        conditionStep.type !==
          "condition"
      ) {
        return;
      }

      const branches =
        getBranches(
          conditionStep
        );

      const branch =
        branches.find(
          (
            item
          ) =>
            item.id ===
            branchId
        );

      if (
        !branch
      ) {
        return;
      }

      const newStepId =
        createStepId(
          type,
          steps
        );

      const newStep =
        createDefaultStep(
          newStepId,
          type
        );

      const previousTarget =
        branch.nextStepId;

      const nextBranches =
        branches.map(
          (
            item
          ) =>
            item.id ===
            branchId
              ? {
                  ...item,
                  nextStepId:
                    newStepId,
                }
              : item
        );

      onChange({
        ...value,
        steps: {
          ...steps,
          [
            conditionStepId
          ]: {
            ...conditionStep,
            config: {
              ...conditionStep.config,
              branches:
                nextBranches,
            },
          },
          [
            newStepId
          ]: {
            ...newStep,
            ...(
              type !==
              "end"
                ? {
                    nextStepId:
                      previousTarget,
                  }
                : {}
            ),
          },
        },
      });

      setSelectedStepId(
        newStepId
      );
    };

  const removeStep =
    (
      stepIdToRemove: string
    ) => {
      const removedStep =
        steps[
          stepIdToRemove
        ];

      const managedWait =
        getManagedWaitStep(
          removedStep,
          steps
        );

      const approved =
        window.confirm(
          "למחוק את השלב?"
        );

      if (
        !approved
      ) {
        return;
      }

      const idsToRemove =
        new Set<string>([
          stepIdToRemove,
        ]);

      if (
        managedWait
      ) {
        idsToRemove.add(
          managedWait.id
        );
      }

      const replacementStepId =
        managedWait
          ? managedWait
              .nextStepId ||
            null
          : removedStep &&
            removedStep.type !==
              "condition"
            ? removedStep
                .nextStepId ||
              null
            : null;

      const nextSteps:
        Record<
          string,
          FlowStep
        > = {};

      for (
        const [
          stepId,
          step,
        ] of Object.entries(
          steps
        )
      ) {
        if (
          idsToRemove.has(
            stepId
          )
        ) {
          continue;
        }

        const nextStepId =
          step.nextStepId &&
          idsToRemove.has(
            step.nextStepId
          )
            ? replacementStepId
            : step.nextStepId;

        if (
          step.type ===
          "condition"
        ) {
          const branches =
            getBranches(
              step
            ).map(
              (
                branch
              ) => ({
                ...branch,
                nextStepId:
                  branch
                    .nextStepId &&
                  idsToRemove.has(
                    branch.nextStepId
                  )
                    ? replacementStepId
                    : branch
                        .nextStepId,
              })
            );

          const fallbackStepId =
            s(
              step.config
                ?.fallbackStepId
            );

          nextSteps[
            stepId
          ] = {
            ...step,
            nextStepId,
            config: {
              ...step.config,
              branches,
              fallbackStepId:
                fallbackStepId &&
                idsToRemove.has(
                  fallbackStepId
                )
                  ? replacementStepId
                  : fallbackStepId ||
                    null,
            },
          };

          continue;
        }

        nextSteps[
          stepId
        ] = {
          ...step,
          nextStepId,
        };
      }

      const remainingIds =
        getVisibleStepIds(
          nextSteps
        );

      onChange({
        ...value,
        firstStepId:
          idsToRemove.has(
            value.firstStepId
          )
            ? replacementStepId ||
              remainingIds[
                0
              ] ||
              ""
            : value.firstStepId,
        steps:
          nextSteps,
      });

      if (
        selectedStepId &&
        idsToRemove.has(
          selectedStepId
        )
      ) {
        setSelectedStepId(
          null
        );
      }
    };

  const selectedStep =
    selectedStepId
      ? steps[
          selectedStepId
        ] ||
        null
      : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">
              מסלול האוטומציה
            </h2>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {getVisibleStepIds(
                steps
              ).length} שלבים
            </span>

            {disconnectedIds.length ===
            0 &&
            getVisibleStepIds(
              steps
            ).length >
              0 ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                כל השלבים מחוברים
              </span>
            ) : disconnectedIds.length >
              0 ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                {disconnectedIds.length} שלבים לא מחוברים
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-slate-500">
            שלב ניתוב יכול לפתוח מספר ענפים במקביל בקנבס.
          </p>
        </div>
      </header>

      <div className="relative min-h-[520px] overflow-x-auto px-5 py-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="relative mx-auto flex min-w-[760px] max-w-7xl flex-col items-center">
          <div className="w-full max-w-lg rounded-3xl border border-blue-200 bg-white p-5 text-center shadow-sm">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-xl">
              ⚡
            </div>

            <div className="mt-3 text-xs font-bold text-blue-600">
              טריגר
            </div>

            <div className="mt-1 font-bold text-slate-900">
              {triggerLabel(
                String(
                  value.trigger
                    ?.type ||
                  ""
                )
              )}
            </div>
          </div>

          <FlowConnector
            onAdd={(
              type
            ) =>
              addLinearStep(
                null,
                type
              )
            }
          />

          <FlowBranchCanvas
            firstStepId={
              value.firstStepId
            }
            steps={
              steps
            }
            selectedStepId={
              selectedStepId
            }
            onSelectStep={
              setSelectedStepId
            }
            onDeleteStep={
              removeStep
            }
            onSetFirst={(
              stepId
            ) =>
              onChange({
                ...value,
                firstStepId:
                  stepId,
              })
            }
            onAddLinearStep={
              addLinearStep
            }
            onAddBranchStep={
              addBranchStep
            }
          />

          {disconnectedIds.length >
          0 ? (
            <div className="mt-10 w-full rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
              <div className="font-bold text-amber-800">
                שלבים שאינם מחוברים למסלול הראשי
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {disconnectedIds.map(
                  (
                    stepId
                  ) => (
                    <button
                      type="button"
                      key={
                        stepId
                      }
                      className="rounded-2xl border border-amber-200 bg-white p-4 text-right text-sm hover:border-blue-300"
                      onClick={() =>
                        setSelectedStepId(
                          stepId
                        )
                      }
                    >
                      <div className="font-bold text-slate-900">
                        {steps[
                          stepId
                        ]?.name ||
                          stepId}
                      </div>

                      <div
                        className="mt-1 text-xs text-slate-400"
                        dir="ltr"
                      >
                        {stepId}
                      </div>
                    </button>
                  )
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <FlowStepDrawer
        open={
          Boolean(
            selectedStep
          )
        }
        step={
          selectedStep
        }
        stepIds={
          Object.keys(
            steps
          )
        }
        steps={
          steps
        }
        onClose={() =>
          setSelectedStepId(
            null
          )
        }
        onUpdateStep={
          updateStep
        }
        onUpdateConfig={
          updateConfig
        }
        onReplaceSteps={
          replaceSteps
        }
      />
    </section>
  );
}
