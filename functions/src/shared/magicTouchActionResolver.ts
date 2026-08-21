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

const AI_MODEL =
  "gpt-5.6-luna";

const DEFAULT_MIN_CONFIDENCE =
  0.8;

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
      (value) =>
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
    (expectedAction) =>
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
}: {
  input:
    MagicTouchActionResolverInput;

  result:
    MagicTouchActionResolverResult;
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

        purpose:
          "intent_resolution",

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
    /*
     * שימוש ב-AI לא צריך להיכשל
     * רק כי רישום usage נכשל.
     */
    logger.error(
      "[MagicTouchActionResolver] Failed to save AI usage",
      {
        agentId,

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
  }
}

async function resolveWithOpenAI(
  input:
    MagicTouchActionResolverInput,
  expectedActions:
    string[]
): Promise<MagicTouchActionResolverResult> {
  const apiKey =
    s(
      OPENAI_API_KEY
        .value()
    );

  if (
    !apiKey
  ) {
    return {
      resolvedAction:
        null,

      confidence:
        null,

      source:
        "unresolved",

      reason:
        "openai_api_key_missing",
    };
  }

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

            reasoning: {
              effort:
                "none",
            },

            max_output_tokens:
              100,

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
                  "magic_touch_intent_resolution",

                strict:
                  true,

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
    s(
      responseBody
        ?.output_text
    );

  if (
    !outputText
  ) {
    return {
      resolvedAction:
        null,

      confidence:
        null,

      source:
        "unresolved",

      reason:
        "openai_output_missing",

      model:
        AI_MODEL,

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

  let parsed:
    any;

  try {
    parsed =
      JSON.parse(
        outputText
      );
  } catch {
    return {
      resolvedAction:
        null,

      confidence:
        null,

      source:
        "unresolved",

      reason:
        "openai_output_invalid_json",

      model:
        AI_MODEL,

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

  const inputTokens =
    Number(
      responseBody
        ?.usage
        ?.input_tokens ||
      0
    );

  const outputTokens =
    Number(
      responseBody
        ?.usage
        ?.output_tokens ||
      0
    );

  if (
    resolvedAction &&
    !isExpectedAction(
      resolvedAction,
      expectedActions
    )
  ) {
    return {
      resolvedAction:
        null,

      confidence,

      source:
        "unresolved",

      reason:
        "ai_action_not_expected",

      model:
        AI_MODEL,

      inputTokens,

      outputTokens,
    };
  }

  return {
    resolvedAction,

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

  /*
   * Quick Reply הוא Action מפורש.
   * אין שום צורך להפעיל AI.
   */
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

  /*
   * השליטה נמצאת ברמת ה-Flow.
   * אם AI לא הותר ב-Step הזה,
   * לא מתבצעת קריאת API.
   */
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

  try {
    const aiResult =
      await resolveWithOpenAI(
        input,
        expectedActions
      );

    /*
     * רושמים שימוש לצורך עלויות וניטור.
     */
    await saveAiUsage({
      input,
      result:
        aiResult,
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
  } catch (
    error: any
  ) {
    logger.error(
      "[MagicTouchActionResolver] AI resolution failed",
      {
        agentId:
          input.context
            ?.agentId ||
          null,

        runId:
          input.context
            ?.runId ||
          null,

        flowId:
          input.context
            ?.flowId ||
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
    };
  }
}