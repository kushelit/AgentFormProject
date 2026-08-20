/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";
import { logger } from "firebase-functions";

import { adminDb, nowTs } from "./shared/admin";

import type {
  MagicTouchAutomationEvent,
  MagicTouchFlowCondition,
  MagicTouchFlowDefinition,
} from "./shared/magicTouchFlowTypes";

type FlowMatchCheck = {
  field: string;
  expected: any;
  actual: any;
  matched: boolean;
  reason?: string;
};

type ConditionMatchDebug = {
  index: number;
  field: string;
  operator: string;
  expected: any;
  actual: any;
  matched: boolean;
  reason?: string;
};

type FlowMatchResult = {
  flowId: string;
  flowName: string | null;
  matched: boolean;
  checks: FlowMatchCheck[];
  conditions: ConditionMatchDebug[];
  failureReasons: string[];
};

function s(value: any): string {
  return String(value ?? "").trim();
}

function normalizedString(value: any): string {
  return s(value).toLowerCase();
}

function firestoreSafeValue(value: any): any {
  if (value === undefined) {
    return null;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      firestoreSafeValue(item)
    );
  }

  if (typeof value === "object") {
    const result: Record<string, any> = {};

    for (
      const [key, nestedValue] of
      Object.entries(value)
    ) {
      result[key] =
        firestoreSafeValue(
          nestedValue
        );
    }

    return result;
  }

  return String(value);
}

function createRunId(
  eventId: string,
  flowId: string
): string {
  return createHash("sha256")
    .update(`${eventId}:${flowId}`)
    .digest("hex");
}

function getNestedValue(
  source: any,
  path: string
): any {
  const normalizedPath =
    s(path);

  if (!normalizedPath) {
    return undefined;
  }

  const cleanPath =
    normalizedPath.startsWith("event.")
      ? normalizedPath.slice(
        "event.".length
      )
      : normalizedPath;

  return cleanPath
    .split(".")
    .filter(Boolean)
    .reduce(
      (
        current: any,
        key: string
      ) => {
        if (
          current === null ||
          current === undefined
        ) {
          return undefined;
        }

        return current[key];
      },
      source
    );
}

function valuesEqual(
  first: any,
  second: any
): boolean {
  if (
    typeof first === "string" ||
    typeof second === "string"
  ) {
    return (
      normalizedString(first) ===
      normalizedString(second)
    );
  }

  return first === second;
}

function evaluateConditionWithDebug(
  event: MagicTouchAutomationEvent,
  condition: MagicTouchFlowCondition,
  index: number
): ConditionMatchDebug {
  const field =
    s(condition?.field);

  const operator =
    s(condition?.operator);

  const expectedValue =
    condition?.value;

  const actualValue =
    field
      ? getNestedValue(
        event,
        field
      )
      : undefined;

  if (!field) {
    return {
      index,
      field: "",
      operator,
      expected:
        firestoreSafeValue(
          expectedValue
        ),
      actual:
        firestoreSafeValue(
          actualValue
        ),
      matched: false,
      reason:
        "condition_field_missing",
    };
  }

  if (!operator) {
    return {
      index,
      field,
      operator: "",
      expected:
        firestoreSafeValue(
          expectedValue
        ),
      actual:
        firestoreSafeValue(
          actualValue
        ),
      matched: false,
      reason:
        "condition_operator_missing",
    };
  }

  let matched = false;
  let reason:
    string | undefined;

  switch (operator) {
    case "equals":
      matched =
        valuesEqual(
          actualValue,
          expectedValue
        );
      break;

    case "not_equals":
      matched =
        !valuesEqual(
          actualValue,
          expectedValue
        );
      break;

    case "contains":
      if (
        Array.isArray(actualValue)
      ) {
        matched =
          actualValue.some(
            (item) =>
              valuesEqual(
                item,
                expectedValue
              )
          );
      } else {
        matched =
          normalizedString(
            actualValue
          ).includes(
            normalizedString(
              expectedValue
            )
          );
      }
      break;

    case "not_contains":
      if (
        Array.isArray(actualValue)
      ) {
        matched =
          !actualValue.some(
            (item) =>
              valuesEqual(
                item,
                expectedValue
              )
          );
      } else {
        matched =
          !normalizedString(
            actualValue
          ).includes(
            normalizedString(
              expectedValue
            )
          );
      }
      break;

    case "exists":
      matched =
        actualValue !== null &&
        actualValue !== undefined &&
        s(actualValue) !== "";
      break;

    case "not_exists":
      matched =
        actualValue === null ||
        actualValue === undefined ||
        s(actualValue) === "";
      break;

    case "in": {
      const expectedValues =
        Array.isArray(
          expectedValue
        )
          ? expectedValue
          : [];

      matched =
        expectedValues.some(
          (item) =>
            valuesEqual(
              actualValue,
              item
            )
        );

      if (
        !Array.isArray(
          expectedValue
        )
      ) {
        reason =
          "condition_expected_array";
      }

      break;
    }

    case "not_in": {
      const expectedValues =
        Array.isArray(
          expectedValue
        )
          ? expectedValue
          : [];

      matched =
        !expectedValues.some(
          (item) =>
            valuesEqual(
              actualValue,
              item
            )
        );

      if (
        !Array.isArray(
          expectedValue
        )
      ) {
        reason =
          "condition_expected_array";
      }

      break;
    }

    default:
      matched = false;
      reason =
        "unsupported_operator";
      break;
  }

  return {
    index,
    field,
    operator,
    expected:
      firestoreSafeValue(
        expectedValue
      ),
    actual:
      firestoreSafeValue(
        actualValue
      ),
    matched,
    ...(reason
      ? { reason }
      : {}),
  };
}

function createTriggerCheck({
  field,
  expected,
  actual,
  required,
}: {
  field: string;
  expected: any;
  actual: any;
  required: boolean;
}): FlowMatchCheck {
  const expectedText =
    s(expected);

  const actualText =
    s(actual);

  if (
    !required &&
    !expectedText
  ) {
    return {
      field,
      expected: null,
      actual:
        firestoreSafeValue(
          actual
        ),
      matched: true,
      reason:
        "flow_does_not_restrict_field",
    };
  }

  const matched =
    normalizedString(
      expected
    ) ===
    normalizedString(
      actual
    );

  return {
    field,
    expected:
      firestoreSafeValue(
        expected
      ),
    actual:
      firestoreSafeValue(
        actual
      ),
    matched,
    ...(!matched
      ? {
        reason:
          actualText
            ? "value_mismatch"
            : "event_value_missing",
      }
      : {}),
  };
}

function matchFlowToEvent(
  flow: MagicTouchFlowDefinition,
  event: MagicTouchAutomationEvent
): FlowMatchResult {
  const flowId =
    s(
      (flow as any).flowId
    );

  const flowName =
    s(flow?.name) ||
    null;

  const trigger =
    flow?.trigger;

  if (!trigger) {
    return {
      flowId,
      flowName,
      matched: false,
      checks: [],
      conditions: [],
      failureReasons: [
        "flow_trigger_missing",
      ],
    };
  }

  const checks:
    FlowMatchCheck[] = [
      createTriggerCheck({
        field:
          "trigger.type",
        expected:
          trigger.type,
        actual:
          event.triggerType,
        required: true,
      }),

      createTriggerCheck({
        field:
          "trigger.templateName",
        expected:
          trigger.templateName,
        actual:
          event.templateName,
        required: false,
      }),

      createTriggerCheck({
        field:
          "trigger.quickReplyAction",
        expected:
          trigger.quickReplyAction,
        actual:
          event.quickReplyAction,
        required: false,
      }),

      createTriggerCheck({
        field:
          "trigger.sourceSystem",
        expected:
          trigger.sourceSystem,
        actual:
          event.sourceSystem,
        required: false,
      }),

      createTriggerCheck({
        field:
          "trigger.campaignId",
        expected:
          trigger.campaignId,
        actual:
          event.campaignId,
        required: false,
      }),
    ];

  const conditions =
    Array.isArray(
      trigger.conditions
    )
      ? trigger.conditions
      : [];

  const conditionResults =
    conditions.map(
      (
        condition,
        index
      ) =>
        evaluateConditionWithDebug(
          event,
          condition,
          index
        )
    );

  const failureReasons = [
    ...checks
      .filter(
        (check) =>
          !check.matched
      )
      .map(
        (check) =>
          `${check.field}:${check.reason || "not_matched"}`
      ),

    ...conditionResults
      .filter(
        (condition) =>
          !condition.matched
      )
      .map(
        (condition) =>
          `condition[${condition.index}]:${condition.reason || "not_matched"}`
      ),
  ];

  return {
    flowId,
    flowName,
    matched:
      failureReasons.length ===
      0,
    checks,
    conditions:
      conditionResults,
    failureReasons,
  };
}

export async function processMagicTouchEventImpl({
  agentId,
  eventId,
}: {
  agentId: string;
  eventId: string;
}): Promise<object> {
  const normalizedAgentId =
    s(agentId);

  const normalizedEventId =
    s(eventId);

  if (
    !normalizedAgentId ||
    !normalizedEventId
  ) {
    throw new Error(
      "Missing agentId or eventId"
    );
  }

  const db =
    adminDb();

  const eventRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/magic_touch_events/${normalizedEventId}`
    );

  const eventSnap =
    await eventRef.get();

  if (!eventSnap.exists) {
    logger.warn(
      "[processMagicTouchEvent] Event was not found",
      {
        agentId:
          normalizedAgentId,
        eventId:
          normalizedEventId,
      }
    );

    return {
      ok: false,
      ignored: true,
      reason:
        "event_not_found",
    };
  }

  const event =
    {
      eventId:
        eventSnap.id,
      ...eventSnap.data(),
    } as MagicTouchAutomationEvent;

  if (
    event.status !==
    "pending"
  ) {
    logger.info(
      "[processMagicTouchEvent] Event is not pending",
      {
        agentId:
          normalizedAgentId,
        eventId:
          normalizedEventId,
        status:
          event.status,
      }
    );

    return {
      ok: true,
      ignored: true,
      reason:
        "event_not_pending",
      status:
        event.status,
    };
  }

  const claimed =
    await (db as any)
      .runTransaction(
        async (
          transaction: any
        ) => {
          const currentSnap =
            await transaction.get(
              eventRef
            );

          if (
            !currentSnap.exists
          ) {
            return false;
          }

          const currentStatus =
            s(
              currentSnap
                .data()
                ?.status
            );

          if (
            currentStatus !==
            "pending"
          ) {
            return false;
          }

          transaction.set(
            eventRef,
            {
              status:
                "processing",
              processingStartedAt:
                nowTs(),
              attempts:
                Number(
                  currentSnap
                    .data()
                    ?.attempts ||
                  0
                ) + 1,
              updatedAt:
                nowTs(),
            },
            {
              merge: true,
            }
          );

          return true;
        }
      );

  if (!claimed) {
    return {
      ok: true,
      ignored: true,
      reason:
        "event_already_claimed",
    };
  }

  try {
const routing =
  (event as any)
    ?.routing ||
  {};

const routingHandling =
  s(
    routing.handling
  );

const activeRunId =
  s(
    routing.activeRunId
  );

const resolvedAction =
  s(
    routing.resolvedAction
  );

if (
  routingHandling ===
    "continue_flow" &&
  activeRunId
) {
  const runRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/magic_touch_flow_runs/${activeRunId}`
    );

  const resumeResult =
    await (db as any)
      .runTransaction(
        async (
          transaction: any
        ) => {
          const runSnap =
            await transaction.get(
              runRef
            );

          if (
            !runSnap.exists
          ) {
            return {
              resumed:
                false,

              reason:
                "active_run_not_found",
            };
          }

          const runData =
            runSnap.data();

          const runStatus =
            s(
              runData
                ?.status
            );

          const waitingFor =
            runData
              ?.waitingFor ||
            null;

          const waitingForType =
            s(
              waitingFor
                ?.type
            );

          if (
            runStatus !==
              "waiting" ||
            waitingForType !==
              "customer_response"
          ) {
            return {
              resumed:
                false,

              reason:
                "run_not_waiting_for_customer_response",
            };
          }

          const expectedActions =
            Array.isArray(
              waitingFor
                ?.expectedActions
            )
              ? waitingFor
                  .expectedActions
                  .map(
                    (
                      value: any
                    ) =>
                      s(value)
                  )
                  .filter(
                    Boolean
                  )
              : [];

          const actionExpected =
            Boolean(
              resolvedAction
            ) &&
            expectedActions.some(
              (
                expectedAction:
                  string
              ) =>
                expectedAction ===
                resolvedAction
            );

          if (
            !actionExpected
          ) {
            return {
              resumed:
                false,

              reason:
                "resolved_action_not_expected",
            };
          }

          const resumeStepId =
            s(
              waitingFor
                ?.resumeStepId
            );

          if (
            !resumeStepId
          ) {
            return {
              resumed:
                false,

              reason:
                "resume_step_missing",
            };
          }

          transaction.set(
            runRef,
            {
              status:
                "queued",

              currentStepId:
                resumeStepId,

              executionEventId:
                normalizedEventId,

              waitingFor:
                null,

              waitingUntil:
                null,

              lastResumeEventId:
                normalizedEventId,

              lastResolvedAction:
                resolvedAction,

              resumedAt:
                nowTs(),

              updatedAt:
                nowTs(),
            },
            {
              merge:
                true,
            }
          );

          transaction.set(
            eventRef,
            {
              status:
                "dispatched",

              resumedRunId:
                activeRunId,

              flowRunIds: [
                activeRunId,
              ],

              resume: {
                resumed:
                  true,

                runId:
                  activeRunId,

                resolvedAction,

                resumeStepId,
              },

              dispatchedAt:
                nowTs(),

              processedAt:
                nowTs(),

              updatedAt:
                nowTs(),
            },
            {
              merge:
                true,
            }
          );

          return {
            resumed:
              true,

            runId:
              activeRunId,

            resumeStepId,
          };
        }
      );

  if (
    resumeResult
      ?.resumed
  ) {
    logger.info(
      "[processMagicTouchEvent] Waiting run resumed",
      {
        agentId:
          normalizedAgentId,

        eventId:
          normalizedEventId,

        runId:
          activeRunId,

        resolvedAction,

        resumeStepId:
          resumeResult
            .resumeStepId,
      }
    );

    return {
      ok:
        true,

      resumed:
        true,

      agentId:
        normalizedAgentId,

      eventId:
        normalizedEventId,

      runId:
        activeRunId,

      resolvedAction,

      resumeStepId:
        resumeResult
          .resumeStepId,
    };
  }

  /*
   * ה-Router אמר continue_flow,
   * אבל בזמן העיבוד כבר אי אפשר
   * היה לחדש את ה-Run.
   *
   * לא מפעילים Flow חדש במקרה כזה.
   */
  await eventRef.set(
    {
      status:
        "ignored",

      resume: {
        resumed:
          false,

        runId:
          activeRunId,

        resolvedAction:
          resolvedAction ||
          null,

        reason:
          resumeResult
            ?.reason ||
          "resume_failed",
      },

      processedAt:
        nowTs(),

      updatedAt:
        nowTs(),
    },
    {
      merge:
        true,
    }
  );

  return {
    ok:
      true,

    ignored:
      true,

    reason:
      resumeResult
        ?.reason ||
      "resume_failed",

    runId:
      activeRunId,
  };
}

    const flowsSnap =
      await (db as any)
        .collection(
          `agents/${normalizedAgentId}/magic_touch_flows`
        )
        .where(
          "status",
          "==",
          "active"
        )
        .get();

    const flows =
      flowsSnap.docs.map(
        (
          flowDoc: any
        ) => ({
          flowId:
            flowDoc.id,
          ...flowDoc.data(),
        })
      ) as MagicTouchFlowDefinition[];

      const rawFlowsDebug =
  flowsSnap.docs.map(
    (flowDoc: any) => {
      const data =
        flowDoc.data();

      return {
        documentId:
          flowDoc.id,

        keys:
          Object.keys(
            data || {}
          ),

        triggerExists:
          Boolean(
            data?.trigger
          ),

        trigger:
          firestoreSafeValue(
            data?.trigger
          ),

        fullData:
          firestoreSafeValue(
            data
          ),
      };
    }
  );

    const matchResults =
      flows.map(
        (flow) =>
          matchFlowToEvent(
            flow,
            event
          )
      );

    const matchingFlowIds =
      new Set(
        matchResults
          .filter(
            (result) =>
              result.matched
          )
          .map(
            (result) =>
              result.flowId
          )
      );

    const matchingFlows =
      flows.filter(
        (flow) =>
          matchingFlowIds.has(
            s(
              (flow as any)
                .flowId
            )
          )
      );

   const debugFlowMatching = {
  evaluatedAt:
    nowTs(),

  eventTrigger: {
    type:
      s(event.triggerType) ||
      null,

    templateName:
      s(event.templateName) ||
      null,

    quickReplyAction:
      s(
        event.quickReplyAction
      ) ||
      null,

    sourceSystem:
      s(event.sourceSystem) ||
      null,

    campaignId:
      s(event.campaignId) ||
      null,
  },

  activeFlowCount:
    flows.length,

  matchedFlowCount:
    matchingFlows.length,

  rawFlows:
    rawFlowsDebug,

  flows:
    matchResults,
};

    logger.info(
      "[processMagicTouchEvent] Flow matching completed",
      {
        agentId:
          normalizedAgentId,
        eventId:
          normalizedEventId,
        activeFlowCount:
          flows.length,
        matchedFlowCount:
          matchingFlows.length,
        matchResults,
      }
    );

    if (
      matchingFlows.length ===
      0
    ) {
      await eventRef.set(
        {
          status:
            "ignored",

          matchedFlowCount:
            0,

          matchedFlowIds:
            [],

          flowRunIds:
            [],

          debugFlowMatching,

          processedAt:
            nowTs(),

          updatedAt:
            nowTs(),
        },
        {
          merge: true,
        }
      );

      logger.info(
        "[processMagicTouchEvent] No matching flows",
        {
          agentId:
            normalizedAgentId,
          eventId:
            normalizedEventId,
          triggerType:
            event.triggerType,
          templateName:
            event.templateName,
          quickReplyAction:
            event.quickReplyAction,
        }
      );

      return {
        ok: true,
        matchedFlowCount: 0,
        matchedFlowIds: [],
        runIds: [],
        debugFlowMatching,
      };
    }

    const batch =
      (db as any).batch();

    const runIds:
      string[] = [];

    const matchedFlowIds:
      string[] = [];

    for (
      const flow of
      matchingFlows
    ) {
      const flowId =
        s(
          (flow as any)
            .flowId
        );

      const firstStepId =
        s(flow.firstStepId);

      if (
        !flowId ||
        !firstStepId
      ) {
        logger.warn(
          "[processMagicTouchEvent] Flow is missing flowId or firstStepId",
          {
            agentId:
              normalizedAgentId,
            eventId:
              normalizedEventId,
            flowId,
            firstStepId,
          }
        );

        continue;
      }

      const runId =
        createRunId(
          normalizedEventId,
          flowId
        );

      const runRef =
        (db as any).doc(
          `agents/${normalizedAgentId}/magic_touch_flow_runs/${runId}`
        );

      batch.set(
        runRef,
        {
          runId,

          agentId:
            normalizedAgentId,

          flowId,

          flowName:
            s(flow.name) ||
            null,

          flowVersion:
            Number(
              flow.version ||
              1
            ),

          eventId:
            normalizedEventId,

            executionEventId:
      normalizedEventId,

          contactId:
            s(event.contactId) ||
            null,

          conversationId:
            s(
              event.conversationId
            ) ||
            null,

          triggerType:
            s(event.triggerType),

          status:
            "queued",

          currentStepId:
            firstStepId,

          error:
            null,

          createdAt:
            nowTs(),

          updatedAt:
            nowTs(),
        },
        {
          merge: false,
        }
      );

      runIds.push(
        runId
      );

      matchedFlowIds.push(
        flowId
      );
    }

    batch.set(
      eventRef,
      {
        status:
          runIds.length > 0
            ? "dispatched"
            : "ignored",

        matchedFlowCount:
          runIds.length,

        matchedFlowIds,

        flowRunIds:
          runIds,

        debugFlowMatching: {
          ...debugFlowMatching,
          matchedFlowCount:
            runIds.length,
        },

        dispatchedAt:
          runIds.length > 0
            ? nowTs()
            : null,

        processedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge: true,
      }
    );

    await batch.commit();

    logger.info(
      "[processMagicTouchEvent] Event dispatched",
      {
        agentId:
          normalizedAgentId,
        eventId:
          normalizedEventId,
        triggerType:
          event.triggerType,
        matchedFlowIds,
        runIds,
      }
    );

    return {
      ok: true,
      agentId:
        normalizedAgentId,
      eventId:
        normalizedEventId,
      matchedFlowCount:
        runIds.length,
      matchedFlowIds,
      runIds,
      debugFlowMatching,
    };
  } catch (
    error: any
  ) {
    const errorMessage =
      error?.message ||
      String(error);

    logger.error(
      "[processMagicTouchEvent] Processing failed",
      {
        agentId:
          normalizedAgentId,
        eventId:
          normalizedEventId,
        error:
          errorMessage,
      }
    );

    await eventRef.set(
      {
        status:
          "failed",

        error:
          errorMessage,

        failedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge: true,
      }
    );

    throw error;
  }
}
