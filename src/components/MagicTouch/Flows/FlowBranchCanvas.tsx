"use client";

import React from "react";

import type {
  FlowBranch,
  FlowStep,
  StepType,
} from "@/lib/MagicTouch/flows/types";

import FlowNode from "./FlowNode";
import FlowConnector from "./FlowConnector";

type Props = {
  firstStepId: string;
  steps: Record<string, FlowStep>;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onSetFirst: (stepId: string) => void;
  onAddLinearStep: (
    afterStepId: string | null,
    type: StepType
  ) => void;
  onAddBranchStep: (
    conditionStepId: string,
    branchId: string,
    type: StepType
  ) => void;
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
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
        ) ||
        `ענף ${index + 1}`,
      nextStepId:
        s(
          branch
            ?.nextStepId
        ) ||
        null,
    })
  );
}

function isConnected(
  step: FlowStep
): boolean {
  if (
    step.type ===
    "end"
  ) {
    return true;
  }

  if (
    step.type ===
    "condition"
  ) {
    const branches =
      getBranches(
        step
      );

    return (
      branches.length >
        0 &&
      branches.every(
        (
          branch
        ) =>
          Boolean(
            branch.nextStepId
          )
      )
    );
  }

  return Boolean(
    step.nextStepId
  );
}

function getNodeNextLabel(
  step: FlowStep,
  steps: Record<string, FlowStep>
): string | null {
  if (
    step.type ===
    "condition"
  ) {
    const branches =
      getBranches(
        step
      );

    return branches.length >
      0
      ? `${branches.length} ענפים`
      : null;
  }

  const nextStepId =
    s(
      step.nextStepId
    );

  if (
    !nextStepId
  ) {
    return null;
  }

  return (
    steps[
      nextStepId
    ]?.name ||
    nextStepId
  );
}

type BranchTreeProps = {
  stepId: string;
  steps: Record<string, FlowStep>;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onSetFirst: (stepId: string) => void;
  onAddLinearStep: (
    afterStepId: string | null,
    type: StepType
  ) => void;
  onAddBranchStep: (
    conditionStepId: string,
    branchId: string,
    type: StepType
  ) => void;
  visited: Set<string>;
  depth: number;
  isFirst: boolean;
};

function BranchTree({
  stepId,
  steps,
  selectedStepId,
  onSelectStep,
  onDeleteStep,
  onSetFirst,
  onAddLinearStep,
  onAddBranchStep,
  visited,
  depth,
  isFirst,
}: BranchTreeProps) {
  const step =
    steps[
      stepId
    ];

  if (
    !step
  ) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        שלב לא קיים: {stepId}
      </div>
    );
  }

  if (
    visited.has(
      stepId
    )
  ) {
    return (
      <button
        type="button"
        className="w-full max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:border-blue-300 hover:bg-blue-50"
        onClick={() =>
          onSelectStep(
            stepId
          )
        }
      >
        ↩ המשך לשלב שכבר מוצג: {step.name || stepId}
      </button>
    );
  }

  const nextVisited =
    new Set(
      visited
    );

  nextVisited.add(
    stepId
  );

  const nextStepName =
    getNodeNextLabel(
      step,
      steps
    );

  if (
    step.type ===
    "condition"
  ) {
    const branches =
      getBranches(
        step
      );

    return (
      <div className="flex w-full flex-col items-center">
        <FlowNode
          step={
            step
          }
          stepNumber={
            depth + 1
          }
          nextStepName={
            nextStepName
          }
          isFirst={
            isFirst
          }
          isSelected={
            selectedStepId ===
            stepId
          }
          isConnected={
            isConnected(
              step
            )
          }
          onSelect={() =>
            onSelectStep(
              stepId
            )
          }
          onDelete={() =>
            onDeleteStep(
              stepId
            )
          }
          onSetFirst={() =>
            onSetFirst(
              stepId
            )
          }
        />

        {branches.length ===
        0 ? (
          <div className="mt-4 w-full max-w-lg rounded-2xl border-2 border-dashed border-fuchsia-200 bg-fuchsia-50/60 p-4 text-center text-sm text-fuchsia-700">
            פתחי את השלב והגדירי ענפים.
          </div>
        ) : (
          <div className="mt-8 grid w-full gap-6 md:grid-cols-2 xl:grid-cols-3">
            {branches.map(
              (
                branch
              ) => (
                <div
                  key={
                    branch.id
                  }
                  className="flex min-w-0 flex-col items-center rounded-3xl border border-fuchsia-100 bg-fuchsia-50/40 p-4"
                >
                  <div className="rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-bold text-fuchsia-700">
                    {branch.label ||
                      branch.value}
                  </div>

                  <div className="h-5 w-px bg-fuchsia-300" />

                  {branch.nextStepId ? (
                    <BranchTree
                      stepId={
                        branch.nextStepId
                      }
                      steps={
                        steps
                      }
                      selectedStepId={
                        selectedStepId
                      }
                      onSelectStep={
                        onSelectStep
                      }
                      onDeleteStep={
                        onDeleteStep
                      }
                      onSetFirst={
                        onSetFirst
                      }
                      onAddLinearStep={
                        onAddLinearStep
                      }
                      onAddBranchStep={
                        onAddBranchStep
                      }
                      visited={
                        nextVisited
                      }
                      depth={
                        depth + 1
                      }
                      isFirst={
                        false
                      }
                    />
                  ) : (
                    <div className="w-full">
                      <FlowConnector
                        onAdd={(
                          type
                        ) =>
                          onAddBranchStep(
                            stepId,
                            branch.id,
                            type
                          )
                        }
                      />

                      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/80 p-4 text-center text-sm text-slate-500">
                        הוסיפי את הפעולה הראשונה לענף
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center">
      <FlowNode
        step={
          step
        }
        stepNumber={
          depth + 1
        }
        nextStepName={
          nextStepName
        }
        isFirst={
          isFirst
        }
        isSelected={
          selectedStepId ===
          stepId
        }
        isConnected={
          isConnected(
            step
          )
        }
        onSelect={() =>
          onSelectStep(
            stepId
          )
        }
        onDelete={() =>
          onDeleteStep(
            stepId
          )
        }
        onSetFirst={() =>
          onSetFirst(
            stepId
          )
        }
      />

      {step.type !==
      "end" ? (
        <>
          <FlowConnector
            onAdd={(
              type
            ) =>
              onAddLinearStep(
                stepId,
                type
              )
            }
          />

          {step.nextStepId ? (
            <BranchTree
              stepId={
                step.nextStepId
              }
              steps={
                steps
              }
              selectedStepId={
                selectedStepId
              }
              onSelectStep={
                onSelectStep
              }
              onDeleteStep={
                onDeleteStep
              }
              onSetFirst={
                onSetFirst
              }
              onAddLinearStep={
                onAddLinearStep
              }
              onAddBranchStep={
                onAddBranchStep
              }
              visited={
                nextVisited
              }
              depth={
                depth + 1
              }
              isFirst={
                false
              }
            />
          ) : (
            <div className="w-full max-w-lg rounded-2xl border-2 border-dashed border-slate-300 bg-white/80 p-4 text-center text-sm text-slate-500">
              אין שלב המשך
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function FlowBranchCanvas({
  firstStepId,
  steps,
  selectedStepId,
  onSelectStep,
  onDeleteStep,
  onSetFirst,
  onAddLinearStep,
  onAddBranchStep,
}: Props) {
  if (
    !firstStepId ||
    !steps[
      firstStepId
    ]
  ) {
    return (
      <div className="w-full max-w-lg rounded-3xl border-2 border-dashed border-slate-300 bg-white/80 p-10 text-center">
        <div className="text-4xl">
          ⚙️
        </div>

        <h3 className="mt-4 text-lg font-bold text-slate-900">
          הוסיפי את הפעולה הראשונה
        </h3>
      </div>
    );
  }

  return (
    <div className="w-full">
      <BranchTree
        stepId={
          firstStepId
        }
        steps={
          steps
        }
        selectedStepId={
          selectedStepId
        }
        onSelectStep={
          onSelectStep
        }
        onDeleteStep={
          onDeleteStep
        }
        onSetFirst={
          onSetFirst
        }
        onAddLinearStep={
          onAddLinearStep
        }
        onAddBranchStep={
          onAddBranchStep
        }
        visited={
          new Set<string>()
        }
        depth={
          0
        }
        isFirst={
          true
        }
      />
    </div>
  );
}
