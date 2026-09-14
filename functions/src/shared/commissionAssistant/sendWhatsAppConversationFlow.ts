/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "../admin";

import {
  PORTAL_ENC_KEY_B64,
} from "../secrets";

import {
  decryptJsonAes256Gcm,
} from "../cryptoAesGcm";

import {
  safeString,
} from "../magicTouchContacts";

import {
  resolveMagicTouchContact,
} from "../magicTouchContactLookup";

import {
  addMagicTouchTimelineEvent,
} from "../magicTouchTimelineService";

const WA_API_URL =
  "https://graph.facebook.com/v25.0";

export type CommissionAssistantFlowCompanyOption = {
  id: string;
  title: string;
};

export type SendCommissionAssistantCompanyFlowInput = {
  agentId: string;
  conversationId: string;
  flowId: string;
  screenId: string;
  flowToken: string;
  companies: CommissionAssistantFlowCompanyOption[];
};

export type SendCommissionAssistantCompanyFlowResult = {
  ok: true;
  agentId: string;
  contactId: string | null;
  conversationId: string;
  waMessageId: string;
  flowId: string;
  screenId: string;
};

function normalizeCompanies(
  value: unknown
): CommissionAssistantFlowCompanyOption[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  const result:
    CommissionAssistantFlowCompanyOption[] = [];

  const ids =
    new Set<string>();

  for (
    const item of
    value
  ) {
    const id =
      safeString(
        item?.id
      );

    const title =
      safeString(
        item?.title
      );

    if (
      !id ||
      !title ||
      ids.has(
        id
      )
    ) {
      continue;
    }

    ids.add(
      id
    );

    result.push({
      id,
      title,
    });
  }

  return result;
}

export async function sendCommissionAssistantCompanyFlow({
  agentId,
  conversationId,
  flowId,
  screenId,
  flowToken,
  companies,
}: SendCommissionAssistantCompanyFlowInput): Promise<SendCommissionAssistantCompanyFlowResult> {
  const normalizedAgentId =
    safeString(
      agentId
    );

  const normalizedConversationId =
    safeString(
      conversationId
    );

  const normalizedFlowId =
    safeString(
      flowId
    );

  const normalizedScreenId =
    safeString(
      screenId
    );

  const normalizedFlowToken =
    safeString(
      flowToken
    );

  const normalizedCompanies =
    normalizeCompanies(
      companies
    );

  if (
    !normalizedAgentId ||
    !normalizedConversationId ||
    !normalizedFlowId ||
    !normalizedScreenId ||
    !normalizedFlowToken
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing WhatsApp Flow configuration"
    );
  }

  if (
    normalizedCompanies.length ===
      0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "No companies are available for the WhatsApp Flow"
    );
  }

  if (
    normalizedCompanies.length >
      20
  ) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp Flow supports up to 20 company choices"
    );
  }

  const db =
    adminDb();

  const conversationRef =
    db.doc(
      `whatsapp_conversations/${normalizedConversationId}`
    );

  const conversationSnap =
    await conversationRef.get();

  if (
    !conversationSnap.exists
  ) {
    throw new HttpsError(
      "not-found",
      "Conversation not found"
    );
  }

  const conversation =
    conversationSnap.data() as any;

  const conversationAgentId =
    safeString(
      conversation?.agentId
    );

  if (
    conversationAgentId !==
      normalizedAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Conversation does not belong to the requested agent"
    );
  }

  const customerPhone =
    safeString(
      conversation?.customerPhone
    );

  const phoneNumberId =
    safeString(
      conversation?.phoneNumberId
    );

  if (
    !customerPhone ||
    !phoneNumberId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Conversation is missing phone data"
    );
  }

  const magicTouchContact =
    await resolveMagicTouchContact({
      db,
      agentId:
        normalizedAgentId,
      contactId:
        safeString(
          conversation?.contactId
        ) ||
        null,
      phone:
        customerPhone,
    });

  const contactId =
    magicTouchContact
      ?.contactId ||
    null;

  const waSecretSnap =
    await db
      .doc(
        `agents/${normalizedAgentId}/secrets/whatsapp`
      )
      .get();

  if (
    !waSecretSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp token not configured"
    );
  }

  const keyB64 =
    safeString(
      PORTAL_ENC_KEY_B64
        .value()
    );

  if (
    !keyB64
  ) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const waSecret =
    waSecretSnap.data() as any;

  const {
    accessToken,
  } =
    decryptJsonAes256Gcm(
      keyB64,
      waSecret.enc
    ) as any;

  if (
    !accessToken
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid WhatsApp token"
    );
  }

  const displayText =
    "בחר את החברות שתרצה לכלול בריצת העמלות.";

  const providerBody = {
    messaging_product:
      "whatsapp",

    recipient_type:
      "individual",

    to:
      customerPhone,

    type:
      "interactive",

    interactive: {
      type:
        "flow",

      body: {
        text:
          displayText,
      },

      action: {
        name:
          "flow",

        parameters: {
          flow_message_version:
            "3",

          flow_action:
            "navigate",

          flow_token:
            normalizedFlowToken,

          flow_id:
            normalizedFlowId,

          flow_cta:
            "בחר חברות",

          flow_action_payload: {
            screen:
              normalizedScreenId,

            data: {
              session_id:
                normalizedFlowToken,

              companies:
                normalizedCompanies,
            },
          },
        },
      },
    },
  };

  const waRes =
    await fetch(
      `${WA_API_URL}/${phoneNumberId}/messages`,
      {
        method:
          "POST",

        headers: {
          "Authorization":
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            providerBody
          ),
      }
    );

  const responseText =
    await waRes.text();

  let waData:
    any = null;

  if (
    responseText
  ) {
    try {
      waData =
        JSON.parse(
          responseText
        );
    } catch {
      waData = {
        raw:
          responseText,
      };
    }
  }

  const waMessageId =
    safeString(
      waData
        ?.messages?.[0]
        ?.id
    );

  if (
    !waRes.ok ||
    !waMessageId
  ) {
    console.error(
      "[sendCommissionAssistantCompanyFlow] WA error",
      {
        agentId:
          normalizedAgentId,

        conversationId:
          normalizedConversationId,

        flowId:
          normalizedFlowId,

        screenId:
          normalizedScreenId,

        response:
          waData,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      waData?.error?.message ||
        "Failed to send WhatsApp Flow"
    );
  }

  const timestamp =
    nowTs();

  const messageRef =
    conversationRef
      .collection(
        "messages"
      )
      .doc(
        waMessageId
      );

  await messageRef.set({
    agentId:
      normalizedAgentId,

    contactId,

    conversationId:
      normalizedConversationId,

    direction:
      "outbound",

    fromPhoneNumberId:
      phoneNumberId,

    to:
      customerPhone,

    type:
      "interactive",

    interactiveType:
      "flow",

    text:
      displayText,

    flow: {
      flowId:
        normalizedFlowId,

      screenId:
        normalizedScreenId,

      flowToken:
        normalizedFlowToken,

      companyCount:
        normalizedCompanies.length,
    },

    waMessageId,

    status:
      "accepted",

    sentBy:
      "commission_assistant",

    sentByName:
      "MagicSale עמלות",

    source:
      "commission_assistant",

    createdAt:
      timestamp,

    updatedAt:
      timestamp,
  });

  await conversationRef.set(
    {
      agentId:
        normalizedAgentId,

      contactId,

      lastMessageText:
        displayText,

      lastMessageType:
        "interactive",

      lastMessageDirection:
        "outbound",

      lastMessageAt:
        timestamp,

      lastOutboundAt:
        timestamp,

      unreadCount:
        0,

      needsReply:
        false,

      updatedAt:
        timestamp,
    },
    {
      merge:
        true,
    }
  );

  if (
    magicTouchContact
  ) {
    await magicTouchContact
      .contactRef
      .set(
        {
          lastOutboundAt:
            timestamp,

          lastReplyText:
            displayText,

          lastWhatsAppMessageId:
            waMessageId,

          whatsappConversationId:
            normalizedConversationId,

          updatedAt:
            timestamp,
        },
        {
          merge:
            true,
        }
      );

    try {
      await addMagicTouchTimelineEvent({
        agentId:
          normalizedAgentId,

        contactId:
          magicTouchContact
            .contactId,

        type:
          "whatsapp_message_sent",

        channel:
          "whatsapp",

        title:
          "נשלחה בחירת חברות לריצת עמלות",

        description:
          displayText,

        direction:
          "outbound",

        status:
          "completed",

        createdBy:
          "commission_assistant",

        sourceSystem:
          "magic_touch",

        sourceRecordId:
          waMessageId,

        metadata: {
          waMessageId,

          conversationId:
            normalizedConversationId,

          phoneNumberId,

          customerPhone,

          messageType:
            "interactive",

          interactiveType:
            "flow",

          flowId:
            normalizedFlowId,

          screenId:
            normalizedScreenId,

          flowToken:
            normalizedFlowToken,

          companyCount:
            normalizedCompanies.length,
        },
      });
    } catch (
      timelineError: any
    ) {
      console.error(
        "[sendCommissionAssistantCompanyFlow] Timeline event failed",
        {
          agentId:
            normalizedAgentId,

          contactId:
            magicTouchContact
              .contactId,

          conversationId:
            normalizedConversationId,

          waMessageId,

          error:
            timelineError
              ?.message ||
            String(
              timelineError
            ),
        }
      );
    }
  }

  return {
    ok:
      true,

    agentId:
      normalizedAgentId,

    contactId,

    conversationId:
      normalizedConversationId,

    waMessageId,

    flowId:
      normalizedFlowId,

    screenId:
      normalizedScreenId,
  };
}
