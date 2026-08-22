/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createHash,
} from "node:crypto";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  nowTs,
} from "./shared/admin";

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  resolveMagicTouchFlowAccess,
} from "./shared/magicTouchFlowAccess";

import {
  validateMagicTouchFlow,
} from "./shared/magicTouchFlowValidation";

type InboundOption = {
  label:
    string;

  action:
    string;
};

const ONBOARDING_KEY =
  "inbound_first_response_v1";

function cleanObject(
  value: any
): any {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      cleanObject
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    const result:
      Record<
        string,
        any
      > = {};

    for (
      const [
        key,
        nestedValue,
      ] of Object.entries(
        value
      )
    ) {
      if (
        nestedValue ===
        undefined
      ) {
        continue;
      }

      result[key] =
        cleanObject(
          nestedValue
        );
    }

    return result;
  }

  return value;
}

function normalizeOptions(
  value: unknown
): InboundOption[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  const allowedActions =
    new Set([
      "booking",
      "callback",
      "free_text",
    ]);

  const result:
    InboundOption[] = [];

  for (
    const rawOption of
    value
  ) {
    const label =
      safeString(
        (rawOption as any)
          ?.label
      );

    const action =
      safeString(
        (rawOption as any)
          ?.action
      );

    if (
      !label ||
      !allowedActions.has(
        action
      )
    ) {
      continue;
    }

    if (
      result.some(
        (
          item
        ) =>
          item.action ===
          action
      )
    ) {
      continue;
    }

    result.push({
      label,
      action,
    });

    if (
      result.length >=
      3
    ) {
      break;
    }
  }

  return result;
}

function buildConfigSignature({
  welcomeMessage,
  options,
  appointmentProvider,
}: {
  welcomeMessage:
    string;

  options:
    InboundOption[];

  appointmentProvider:
    string;
}): string {
  const payload =
    JSON.stringify({
      welcomeMessage,

      options,

      appointmentProvider,
    });

  return createHash(
    "sha256"
  )
    .update(
      payload
    )
    .digest(
      "hex"
    );
}

function buildInboundFlow({
  flowId,
  agentId,
  welcomeMessage,
  options,
  hasBookingAction,
}: {
  flowId:
    string;

  agentId:
    string;

  welcomeMessage:
    string;

  options:
    InboundOption[];

  hasBookingAction:
    boolean;
}) {
  const sendStepId =
    "send_whatsapp_1";

  const waitStepId =
    "send_whatsapp_1_wait";

  const bookingStepId =
    "send_booking_link_1";

  const endStepId =
    "end_1";

  const buttons =
    options.map(
      (
        option
      ) => ({
        id:
          option.action,

        title:
          option.label,
      })
    );

  /*
   * רק booking ממשיך את אותו Run באופן אוטומטי.
   *
   * callback / free_text עדיין מופיעים ככפתורים
   * ללקוח, אבל אינם expectedActions.
   *
   * לכן:
   * callback -> Conversation Router מזהה Human-only intent
   *             ומעביר ל-Human Attention.
   *
   * free_text -> Safe Reply / AI / Human Attention
   *              לפי מנגנון השיחות הקיים.
   *
   * כך ה-Onboarding נשען על אותו מנוע שיחות
   * שכבר קיים ולא יוצר branching מקביל.
   */
  const expectedActions =
    hasBookingAction
      ? [
          "booking",
        ]
      : [];

  const responseOptions =
    hasBookingAction
      ? options
          .filter(
            (
              option
            ) =>
              option.action ===
              "booking"
          )
          .map(
            (
              option
            ) => ({
              action:
                option.action,

              label:
                option.label,

              description:
                "הלקוח מעוניין לקבוע פגישה.",
            })
          )
      : [];

  const steps:
    Record<
      string,
      any
    > = {
      [sendStepId]: {
        id:
          sendStepId,

        type:
          "send_whatsapp",

        name:
          "מענה ראשוני לפנייה נכנסת",

        nextStepId:
          waitStepId,

        config: {
          mode:
            "interactive_buttons",

          message:
            welcomeMessage,

          buttons,

          waitsForCustomerResponse:
            true,

          managedWaitStepId:
            waitStepId,

          trueStepId:
            null,

          falseStepId:
            null,
        },
      },

      [waitStepId]: {
        id:
          waitStepId,

        type:
          "wait_for_customer_response",

        name:
          "המתנה לתשובת הלקוח",

        nextStepId:
          hasBookingAction
            ? bookingStepId
            : null,

        config: {
          expectedActions,

          responseOptions,

          promptContext: {
            question:
              welcomeMessage,
          },

          resolution: {
            mode:
              "ai_with_human_fallback",

            minConfidence:
              0.8,
          },

          hiddenInBuilder:
            true,

          managedByStepId:
            sendStepId,

          managedRole:
            "whatsapp_response_wait",
        },
      },

      [endStepId]: {
        id:
          endStepId,

        type:
          "end",

        name:
          "סיום התהליך",

        nextStepId:
          null,

        config: {
          message:
            "MagicTouch inbound onboarding flow completed",

          trueStepId:
            null,

          falseStepId:
            null,
        },
      },
    };

  if (
    hasBookingAction
  ) {
    steps[
      bookingStepId
    ] = {
      id:
        bookingStepId,

      type:
        "send_booking_link",

      name:
        "שליחת קישור לקביעת פגישה",

      nextStepId:
        endStepId,

      config: {
        messageBefore:
          "בשמחה, אפשר לבחור מועד שמתאים לך כאן:",

        messageAfter:
          "",
      },
    };
  }

  const flow = {
    flowId,

    agentId,

    name:
      "MagicTouch - מענה ראשון לפנייה נכנסת",

    description:
      "Flow בסיסי שנוצר אוטומטית בתהליך ההקמה של MagicTouch ומטפל בפנייה חדשה מלקוח.",

    status:
      "draft",

    version:
      1,

    firstStepId:
      sendStepId,

    trigger: {
      type:
        "whatsapp_message_received",

      templateName:
        "",

      quickReplyAction:
        "",

      sourceSystem:
        "whatsapp",

      campaignId:
        "",

      conditions: [
        {
          field:
            "routing.handling",

          operator:
            "equals",

          value:
            "start_flow",
        },
      ],
    },

    steps,
  };

  return cleanObject(
    flow
  );
}

export async function ensureMagicTouchOnboardingInboundFlowImpl(
  req: any
): Promise<object> {
  const {
    db,
    authUid,
    agentId,
  } =
    await resolveMagicTouchFlowAccess(
      req
    );

  if (
    !agentId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const magicTouchConfigRef =
    (db as any).doc(
      `agents/${agentId}/config/magicTouch`
    );

  const configSnap =
    await magicTouchConfigRef.get();

  if (
    !configSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "MagicTouch onboarding configuration was not found"
    );
  }

  const config =
    configSnap.data() as any;

  const inboundSelected =
    config
      ?.firstFlowMode
      ?.inbound ===
      true;

  if (
    !inboundSelected
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Inbound onboarding flow is not selected"
    );
  }

  const inboundSetup =
    config
      ?.inboundSetup &&
    typeof config
      .inboundSetup ===
      "object"
      ? config
          .inboundSetup
      : null;

  const inboundCompleted =
    inboundSetup
      ?.completed ===
      true &&
    config
      ?.onboarding
      ?.inboundSetupCompleted ===
      true;

  if (
    !inboundSetup ||
    !inboundCompleted
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Inbound first response setup is not completed"
    );
  }

  const welcomeMessage =
    safeString(
      inboundSetup
        ?.welcomeMessage
    );

  const options =
    normalizeOptions(
      inboundSetup
        ?.options
    );

  if (
    !welcomeMessage ||
    options.length ===
      0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Inbound setup is missing a welcome message or valid options"
    );
  }

  const hasBookingAction =
    options.some(
      (
        option
      ) =>
        option.action ===
        "booking"
    );

  const appointmentProvider =
    safeString(
      config
        ?.appointmentProvider
    );

  if (
    hasBookingAction &&
    (
      !appointmentProvider ||
      appointmentProvider ===
        "none"
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The inbound setup contains a booking action but no appointment provider is configured"
    );
  }

  const configSignature =
    buildConfigSignature({
      welcomeMessage,

      options,

      appointmentProvider,
    });

  const flowsCollection =
    (db as any).collection(
      `agents/${agentId}/magic_touch_flows`
    );

  const existingSnap =
    await flowsCollection
      .where(
        "onboardingKey",
        "==",
        ONBOARDING_KEY
      )
      .limit(
        1
      )
      .get();

  const existingDoc =
    existingSnap.empty
      ? null
      : existingSnap
          .docs[0];

  const flowRef =
    existingDoc
      ? existingDoc.ref
      : flowsCollection.doc();

  const existingData =
    existingDoc
      ? existingDoc.data()
      : null;

  /*
   * Idempotent:
   * אם ההגדרה לא השתנתה, לא מייצרים Version חדש
   * ולא כותבים שוב ל-Firestore.
   */
  if (
    existingData &&
    safeString(
      existingData
        ?.onboardingConfigSignature
    ) ===
      configSignature
  ) {
    return {
      ok:
        true,

      created:
        false,

      updated:
        false,

      unchanged:
        true,

      agentId,

      flowId:
        flowRef.id,

      flowName:
        safeString(
          existingData
            ?.name
        ) ||
        "MagicTouch - מענה ראשון לפנייה נכנסת",

      version:
        Number(
          existingData
            ?.version ||
          1
        ),

      status:
        safeString(
          existingData
            ?.status
        ) ||
        "draft",
    };
  }

  const generatedFlow =
    buildInboundFlow({
      flowId:
        flowRef.id,

      agentId,

      welcomeMessage,

      options,

      hasBookingAction,
    });

  const nextVersion =
    existingData
      ? Number(
          existingData
            ?.version ||
          1
        ) + 1
      : 1;

  generatedFlow.version =
    nextVersion;

  /*
   * אם הסוכן כבר ערך/הפעיל את ה-Flow,
   * לא משנים לו אוטומטית את הסטטוס.
   *
   * ביצירה ראשונה הוא Draft.
   */
  generatedFlow.status =
    existingData
      ? (
          safeString(
            existingData
              ?.status
          ) ||
          "draft"
        )
      : "draft";

  const validation =
    validateMagicTouchFlow(
      generatedFlow
    );

  if (
    !validation.valid
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Generated onboarding Flow is invalid",
      {
        validation,
      }
    );
  }

  const timestamp =
    nowTs();

  await flowRef.set(
    {
      ...generatedFlow,

      onboardingKey:
        ONBOARDING_KEY,

      onboardingGenerated:
        true,

      onboardingConfigSignature:
        configSignature,

      onboardingSource: {
        type:
          "inbound_first_response",

        configPath:
          `agents/${agentId}/config/magicTouch`,

        generatedAt:
          timestamp,
      },

      createdBy:
        existingData
          ?.createdBy ||
        authUid,

      createdAt:
        existingData
          ?.createdAt ||
        timestamp,

      updatedBy:
        authUid,

      updatedAt:
        timestamp,

      activatedAt:
        existingData
          ?.activatedAt ||
        null,

      deactivatedAt:
        existingData
          ?.deactivatedAt ||
        null,
    },
    {
      merge:
        false,
    }
  );

  await magicTouchConfigRef.set(
    {
      onboarding: {
        ...(config
          ?.onboarding ||
          {}),

        inboundSetupCompleted:
          true,

        inboundFlowId:
          flowRef.id,

        inboundFlowVersion:
          nextVersion,

        inboundFlowGeneratedAt:
          timestamp,
      },

      updatedAt:
        timestamp,
    },
    {
      merge:
        true,
    }
  );

  return {
    ok:
      true,

    created:
      !existingData,

    updated:
      Boolean(
        existingData
      ),

    unchanged:
      false,

    agentId,

    flowId:
      flowRef.id,

    flowName:
      generatedFlow.name,

    version:
      nextVersion,

    status:
      generatedFlow.status,

    validation,
  };
}
