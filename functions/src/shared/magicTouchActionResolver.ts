/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  logger,
} from "firebase-functions";

import {
  adminDb,
  nowTs,
} from "./admin";

import {
  OPENAI_API_KEY,
} from "./secrets";

export type MagicTouchActionResolverSource =
  | "quick_reply"
  | "rule"
  | "ai"
  | "unresolved";

export type MagicTouchResolutionMode =
  | "quick_reply_only"
  | "ai"
  | "ai_with_human_fallback";

export interface MagicTouchResponseOption {
  action:
    string;

  label?:
    string;

  description?:
    string;
}

export interface MagicTouchActionResolutionConfig {
  mode?:
    MagicTouchResolutionMode;

  minConfidence?:
    number;
}

export interface MagicTouchActionResolverContext {
  agentId?:
    string | null;

  contactId?:
    string | null;

  conversationId?:
    string | null;

  runId?:
    string | null;

  flowId?:
    string | null;

  flowName?:
    string | null;

  stepId?:
    string | null;

  stepName?:
    string | null;

  lastQuestion?:
    string | null;
}

export interface MagicTouchActionResolverInput {
  messageText:
    string;

  quickReplyAction?:
    string | null;

  expectedActions:
    string[];

  responseOptions?:
    MagicTouchResponseOption[];

  resolution?:
    MagicTouchActionResolutionConfig;

  context?:
    MagicTouchActionResolverContext;
}

export interface MagicTouchActionResolverResult {
  resolvedAction:
    string | null;

  confidence:
    number | null;

  source:
    MagicTouchActionResolverSource;

  reason?:
    string | null;

  model?:
    string | null;

  inputTokens?:
    number | null;

  outputTokens?:
    number | null;
}

export interface MagicTouchConversationCandidate {
  runId:
    string;

  flowId?:
    string | null;

  flowName?:
    string | null;

  status?:
    string | null;

  currentStepId?:
    string | null;

  waitingForType?:
    string | null;

  waitingStepId?:
    string | null;

  prompt?:
    string | null;

  expectedActions?:
    string[];

  responseOptions?:
    MagicTouchResponseOption[];
}

export interface MagicTouchConversationTargetInput {
  messageText:
    string;

  messageType?:
    string | null;

  candidates:
    MagicTouchConversationCandidate[];

  context?:
    {
      agentId?:
        string | null;

      contactId?:
        string | null;

      conversationId?:
        string | null;
    };
}

export interface MagicTouchConversationTargetResult {
  targetRunId:
    string | null;

  intent:
    string | null;

  confidence:
    number | null;

  source:
    "ai" |
    "unresolved";

  reason:
    string;
}

const AI_MODEL =
  "gpt-5.6-luna";

const DEFAULT_MIN_CONFIDENCE =
  0.8;

const TARGET_RUN_MIN_CONFIDENCE =
  0.7;

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeActions(
  values: unknown
): string[] {
  if (
    !Array.isArray(
      values
    )
  ) {
    return [];
  }

  return values
    .map(
      (
        value
      ) =>
        s(value)
    )
    .filter(
      Boolean
    );
}

function isExpectedAction(
  action: string,
  expectedActions: string[]
): boolean {
  if (
    !action
  ) {
    return false;
  }

  return expectedActions.some(
    (
      expectedAction
    ) =>
      expectedAction ===
      action
  );
}

function normalizeConfidence(
  value: unknown
): number {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      parsed
    )
  );
}

function getApiKey(): string {
  return s(
    OPENAI_API_KEY
      .value()
  );
}

function getOutputText(
  responseBody: any
): string {
  const direct =
    s(
      responseBody
        ?.output_text
    );

  if (
    direct
  ) {
    return direct;
  }

  const outputs =
    Array.isArray(
      responseBody
        ?.output
    )
      ? responseBody.output
      : [];

  for (
    const output of
    outputs
  ) {
    const content =
      Array.isArray(
        output?.content
      )
        ? output.content
        : [];

    for (
      const item of
      content
    ) {
      const text =
        s(
          item?.text
        );

      if (
        text
      ) {
        return text;
      }
    }
  }

  return "";
}

async function callOpenAIJson({
  prompt,
  schemaName,
  schema,
}: {
  prompt: string;
  schemaName: string;
  schema: Record<string, any>;
}): Promise<{
  parsed: any;
  inputTokens: number;
  outputTokens: number;
}> {
  const apiKey =
    getApiKey();

  if (
    !apiKey
  ) {
    throw new Error(
      "OPENAI_API_KEY is missing"
    );
  }

  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            model:
              AI_MODEL,

            store:
              false,

            max_output_tokens:
              160,

            input: [
              {
                role:
                  "user",

                content: [
                  {
                    type:
                      "input_text",

                    text:
                      prompt,
                  },
                ],
              },
            ],

            text: {
              format: {
                type:
                  "json_schema",

                name:
                  schemaName,

                strict:
                  true,

                schema,
              },
            },
          }),
      }
    );

  const responseBody:
    any =
    await response.json();

  if (
    !response.ok
  ) {
    const apiMessage =
      s(
        responseBody
          ?.error
          ?.message
      );

    throw new Error(
      apiMessage ||
      `OpenAI request failed with status ${response.status}`
    );
  }

  const outputText =
    getOutputText(
      responseBody
    );

  if (
    !outputText
  ) {
    throw new Error(
      "OpenAI output is missing"
    );
  }

  return {
    parsed:
      JSON.parse(
        outputText
      ),

    inputTokens:
      Number(
        responseBody
          ?.usage
          ?.input_tokens ||
        0
      ),

    outputTokens:
      Number(
        responseBody
          ?.usage
          ?.output_tokens ||
        0
      ),
  };
}

function buildResponseOptionsText(
  responseOptions:
    MagicTouchResponseOption[],
  expectedActions:
    string[]
): string {
  const optionMap =
    new Map<
      string,
      MagicTouchResponseOption
    >();

  for (
    const option of
    responseOptions
  ) {
    const action =
      s(
        option.action
      );

    if (
      action
    ) {
      optionMap.set(
        action,
        option
      );
    }
  }

  return expectedActions
    .map(
      (
        action
      ) => {
        const option =
          optionMap.get(
            action
          );

        const label =
          s(
            option?.label
          );

        const description =
          s(
            option?.description
          );

        const parts =
          [
            `action: ${action}`,
          ];

        if (
          label
        ) {
          parts.push(
            `meaning: ${label}`
          );
        }

        if (
          description
        ) {
          parts.push(
            `description: ${description}`
          );
        }

        return parts.join(
          " | "
        );
      }
    )
    .join(
      "\n"
    );
}

async function saveAiUsage({
  input,
  result,
  purpose,
}: {
  input:
    MagicTouchActionResolverInput;

  result:
    MagicTouchActionResolverResult;

  purpose:
    string;
}): Promise<void> {
  const agentId =
    s(
      input.context
        ?.agentId
    );

  if (
    !agentId
  ) {
    return;
  }

  try {
    const db =
      adminDb();

    await db
      .collection(
        `agents/${agentId}/magic_touch_ai_usage`
      )
      .add({
        provider:
          "openai",

        model:
          result.model ||
          null,

        purpose,

        runId:
          s(
            input.context
              ?.runId
          ) ||
          null,

        flowId:
          s(
            input.context
              ?.flowId
          ) ||
          null,

        stepId:
          s(
            input.context
              ?.stepId
          ) ||
          null,

        contactId:
          s(
            input.context
              ?.contactId
          ) ||
          null,

        conversationId:
          s(
            input.context
              ?.conversationId
          ) ||
          null,

        resolvedAction:
          result
            .resolvedAction ||
          null,

        confidence:
          result
            .confidence ??
          null,

        source:
          result.source,

        reason:
          result.reason ||
          null,

        inputTokens:
          result
            .inputTokens ??
          null,

        outputTokens:
          result
            .outputTokens ??
          null,

        createdAt:
          nowTs(),
      });
  } catch (
    error: any
  ) {
    logger.error(
      "[MagicTouchActionResolver] Failed to save AI usage",
      {
        agentId,

        error:
          error?.message ||
          String(
            error
          ),
      }
    );
  }
}

async function saveTargetRoutingUsage({
  input,
  result,
  inputTokens,
  outputTokens,
}: {
  input:
    MagicTouchConversationTargetInput;

  result:
    MagicTouchConversationTargetResult;

  inputTokens:
    number;

  outputTokens:
    number;
}): Promise<void> {
  const agentId =
    s(
      input.context
        ?.agentId
    );

  if (
    !agentId
  ) {
    return;
  }

  try {
    const db =
      adminDb();

    await db
      .collection(
        `agents/${agentId}/magic_touch_ai_usage`
      )
      .add({
        provider:
          "openai",

        model:
          AI_MODEL,

        purpose:
          "conversation_target_routing",

        contactId:
          s(
            input.context
              ?.contactId
          ) ||
          null,

        conversationId:
          s(
            input.context
              ?.conversationId
          ) ||
          null,

        targetRunId:
          result
            .targetRunId ||
          null,

        intent:
          result.intent ||
          null,

        confidence:
          result
            .confidence ??
          null,

        source:
          result.source,

        reason:
          result.reason,

        candidateCount:
          input.candidates.length,

        inputTokens,

        outputTokens,

        createdAt:
          nowTs(),
      });
  } catch (
    error: any
  ) {
    logger.error(
      "[MagicTouchActionResolver] Failed to save target routing usage",
      {
        agentId,

        error:
          error?.message ||
          String(
            error
          ),
      }
    );
  }
}

export async function resolveMagicTouchConversationTarget(
  input:
    MagicTouchConversationTargetInput
): Promise<MagicTouchConversationTargetResult> {
  const messageText =
    s(
      input.messageText
    );

  const candidates =
    Array.isArray(
      input.candidates
    )
      ? input.candidates
      : [];

  if (
    !messageText ||
    candidates.length ===
      0
  ) {
    return {
      targetRunId:
        null,

      intent:
        null,

      confidence:
        null,

      source:
        "unresolved",

      reason:
        "conversation_target_input_missing",
    };
  }

  /*
   * אם יש Run פעיל אחד בלבד,
   * אין צורך לשלם על AI רק כדי לבחור אותו.
   */
  if (
    candidates.length ===
    1
  ) {
    return {
      targetRunId:
        candidates[0]
          .runId,

      intent:
        null,

      confidence:
        1,

      source:
        "unresolved",

      reason:
        "single_active_run_selected",
    };
  }

  const candidateIds =
    candidates
      .map(
        (
          candidate
        ) =>
          candidate.runId
      )
      .filter(
        Boolean
      );

  const candidatesText =
    candidates
      .map(
        (
          candidate,
          index
        ) => {
          const actions =
            Array.isArray(
              candidate
                .responseOptions
            )
              ? candidate
                  .responseOptions
                  .map(
                    (
                      option
                    ) =>
                      [
                        option.action,
                        s(
                          option.label
                        ),
                        s(
                          option.description
                        ),
                      ]
                        .filter(
                          Boolean
                        )
                        .join(
                          ": "
                        )
                  )
                  .join(
                    ", "
                  )
              : "";

          return [
            `Candidate ${index + 1}`,
            `runId: ${candidate.runId}`,
            `flowName: ${candidate.flowName || ""}`,
            `status: ${candidate.status || ""}`,
            `waitingForType: ${candidate.waitingForType || ""}`,
            `prompt/context: ${candidate.prompt || ""}`,
            `possible actions: ${actions}`,
          ].join(
            "\n"
          );
        }
      )
      .join(
        "\n\n"
      );

  const prompt =
    [
      "You are the conversation router for MagicTouch.",
      "",
      "A customer sent a new WhatsApp message while multiple business flows are active.",
      "Choose which active run the message is most closely related to.",
      "",
      "Important:",
      "- A run may be waiting for a document, signature, booking, customer response, or another event.",
      "- A customer can ask for help about a run even when that message does NOT complete the event the run is waiting for.",
      "- Example: 'I cannot upload the document' belongs to a run waiting for a document, but it does not mean the document was received.",
      "- Example: 'Yes, I want another appointment' belongs to a run whose context asks whether the customer wants to reschedule.",
      "- Do not choose based only on waitingForType. Use the semantic meaning of the customer message and each run context.",
      "- If none of the runs is clearly relevant, return targetRunId as null.",
      "- intent should be a short semantic label such as document_help, signature_help, booking, declined, question, callback, or another concise intent.",
      "",
      `Customer message:\n${messageText}`,
      "",
      `Active runs:\n${candidatesText}`,
    ].join(
      "\n"
    );

  try {
    const {
      parsed,
      inputTokens,
      outputTokens,
    } =
      await callOpenAIJson({
        prompt,

        schemaName:
          "magic_touch_conversation_target",

        schema: {
          type:
            "object",

          additionalProperties:
            false,

          properties: {
            targetRunId: {
              anyOf: [
                {
                  type:
                    "string",

                  enum:
                    candidateIds,
                },

                {
                  type:
                    "null",
                },
              ],
            },

            intent: {
              anyOf: [
                {
                  type:
                    "string",
                },

                {
                  type:
                    "null",
                },
              ],
            },

            confidence: {
              type:
                "number",

              minimum:
                0,

              maximum:
                1,
            },
          },

          required: [
            "targetRunId",
            "intent",
            "confidence",
          ],
        },
      });

    const targetRunId =
      s(
        parsed
          ?.targetRunId
      ) ||
      null;

    const confidence =
      normalizeConfidence(
        parsed
          ?.confidence
      );

    const intent =
      s(
        parsed
          ?.intent
      ) ||
      null;

    const validTarget =
      targetRunId &&
      candidateIds.includes(
        targetRunId
      )
        ? targetRunId
        : null;

    const result:
      MagicTouchConversationTargetResult =
      validTarget &&
      confidence >=
        TARGET_RUN_MIN_CONFIDENCE
        ? {
            targetRunId:
              validTarget,

            intent,

            confidence,

            source:
              "ai",

            reason:
              "ai_conversation_target_resolved",
          }
        : {
            targetRunId:
              null,

            intent,

            confidence,

            source:
              "unresolved",

            reason:
              validTarget
                ? "ai_conversation_target_below_threshold"
                : "ai_conversation_target_unresolved",
          };

    await saveTargetRoutingUsage({
      input,
      result,
      inputTokens,
      outputTokens,
    });

    return result;
  } catch (
    error: any
  ) {
    logger.error(
      "[MagicTouchActionResolver] Conversation target resolution failed",
      {
        agentId:
          input.context
            ?.agentId ||
          null,

        conversationId:
          input.context
            ?.conversationId ||
          null,

        error:
          error?.message ||
          String(
            error
          ),
      }
    );

    return {
      targetRunId:
        null,

      intent:
        null,

      confidence:
        null,

      source:
        "unresolved",

      reason:
        "conversation_target_resolution_failed",
    };
  }
}

async function resolveWithOpenAI(
  input:
    MagicTouchActionResolverInput,
  expectedActions:
    string[]
): Promise<MagicTouchActionResolverResult> {
  const messageText =
    s(
      input.messageText
    );

  const question =
    s(
      input.context
        ?.lastQuestion
    );

  const responseOptions =
    Array.isArray(
      input.responseOptions
    )
      ? input.responseOptions
      : [];

  const optionsText =
    buildResponseOptionsText(
      responseOptions,
      expectedActions
    );

  const prompt =
    [
      "You are an intent classifier inside MagicTouch.",
      "",
      "Your task is only to determine which allowed action best matches the customer's message.",
      "",
      "Important rules:",
      "- Choose only from the supplied allowed actions.",
      "- Do not invent actions.",
      "- Consider the question/context before interpreting short replies such as yes, no, maybe, later, etc.",
      "- If the customer message does not clearly match one of the allowed actions, return resolvedAction as null.",
      "- Confidence must be between 0 and 1.",
      "- Do not answer the customer.",
      "",
      question
        ? `Question/context shown to customer:\n${question}`
        : "Question/context shown to customer: unavailable",
      "",
      `Customer message:\n${messageText}`,
      "",
      `Allowed actions:\n${optionsText}`,
    ].join(
      "\n"
    );

  try {
    const {
      parsed,
      inputTokens,
      outputTokens,
    } =
      await callOpenAIJson({
        prompt,

        schemaName:
          "magic_touch_intent_resolution",

        schema: {
          type:
            "object",

          additionalProperties:
            false,

          properties: {
            resolvedAction: {
              anyOf: [
                {
                  type:
                    "string",

                  enum:
                    expectedActions,
                },

                {
                  type:
                    "null",
                },
              ],
            },

            confidence: {
              type:
                "number",

              minimum:
                0,

              maximum:
                1,
            },
          },

          required: [
            "resolvedAction",
            "confidence",
          ],
        },
      });

    const resolvedAction =
      s(
        parsed
          ?.resolvedAction
      ) ||
      null;

    const confidence =
      normalizeConfidence(
        parsed
          ?.confidence
      );

    return {
      resolvedAction:
        resolvedAction &&
        isExpectedAction(
          resolvedAction,
          expectedActions
        )
          ? resolvedAction
          : null,

      confidence,

      source:
        resolvedAction
          ? "ai"
          : "unresolved",

      reason:
        resolvedAction
          ? "ai_action_resolved"
          : "ai_action_unresolved",

      model:
        AI_MODEL,

      inputTokens,

      outputTokens,
    };
  } catch (
    error: any
  ) {
    logger.error(
      "[MagicTouchActionResolver] AI action resolution failed",
      {
        agentId:
          input.context
            ?.agentId ||
          null,

        runId:
          input.context
            ?.runId ||
          null,

        error:
          error?.message ||
          String(
            error
          ),
      }
    );

    return {
      resolvedAction:
        null,

      confidence:
        null,

      source:
        "unresolved",

      reason:
        "ai_resolution_failed",

      model:
        AI_MODEL,

      inputTokens:
        null,

      outputTokens:
        null,
    };
  }
}

export async function resolveMagicTouchAction(
  input:
    MagicTouchActionResolverInput
): Promise<MagicTouchActionResolverResult> {
  const messageText =
    s(
      input.messageText
    );

  const quickReplyAction =
    s(
      input.quickReplyAction
    );

  const expectedActions =
    normalizeActions(
      input.expectedActions
    );

  if (
    quickReplyAction
  ) {
    if (
      isExpectedAction(
        quickReplyAction,
        expectedActions
      )
    ) {
      return {
        resolvedAction:
          quickReplyAction,

        confidence:
          1,

        source:
          "quick_reply",

        reason:
          "explicit_expected_quick_reply",
      };
    }

    return {
      resolvedAction:
        null,

      confidence:
        1,

      source:
        "unresolved",

      reason:
        "quick_reply_action_not_expected",
    };
  }

  if (
    !messageText
  ) {
    return {
      resolvedAction:
        null,

      confidence:
        null,

      source:
        "unresolved",

      reason:
        "message_text_missing",
    };
  }

  if (
    expectedActions.length ===
      0
  ) {
    return {
      resolvedAction:
        null,

      confidence:
        null,

      source:
        "unresolved",

      reason:
        "expected_actions_missing",
    };
  }

  const resolutionMode =
    input.resolution
      ?.mode ||
    "quick_reply_only";

  if (
    resolutionMode ===
    "quick_reply_only"
  ) {
    return {
      resolvedAction:
        null,

      confidence:
        null,

      source:
        "unresolved",

      reason:
        "ai_not_enabled_for_step",
    };
  }

  const minConfidence =
    Number.isFinite(
      Number(
        input.resolution
          ?.minConfidence
      )
    )
      ? Math.max(
          0,
          Math.min(
            1,
            Number(
              input.resolution
                ?.minConfidence
            )
          )
        )
      : DEFAULT_MIN_CONFIDENCE;

  const aiResult =
    await resolveWithOpenAI(
      input,
      expectedActions
    );

  await saveAiUsage({
    input,

    result:
      aiResult,

    purpose:
      "intent_resolution",
  });

  if (
    !aiResult
      .resolvedAction
  ) {
    return aiResult;
  }

  if (
    (
      aiResult
        .confidence ??
      0
    ) <
    minConfidence
  ) {
    return {
      ...aiResult,

      resolvedAction:
        null,

      source:
        "unresolved",

      reason:
        "ai_confidence_below_threshold",
    };
  }

  return aiResult;
}
