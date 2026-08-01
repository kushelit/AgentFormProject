/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

import { nowTs } from "./admin";
import { PORTAL_ENC_KEY_B64 } from "./secrets";
import { decryptJsonAes256Gcm } from "./cryptoAesGcm";
import { safeString } from "./magicTouchContacts";
import { addMagicTouchTimelineEvent } from "./magicTouchTimelineService";

const WA_API_URL =
  "https://graph.facebook.com/v25.0";

export type MagicTouchWhatsAppTemplateContext = {
  agentId: string;

  phoneNumberId: string;
  accessToken: string;

  templateName: string;
  templateLanguage: string;
  templateBodyText: string;
  bodyVariableCount: number;
};

export type SendMagicTouchTemplateToContactInput = {
  db: any;

  context:
    MagicTouchWhatsAppTemplateContext;

  contactId: string;
  createdBy: string;

  conversationId?: string | null;
  campaignId?: string | null;
};

export type SendMagicTouchTemplateToContactResult = {
  agentId: string;
  contactId: string;

  conversationId: string;
  waMessageId: string;

  phoneNormalized: string;

  templateName: string;
  templateLanguage: string;
  templateVariables: string[];

  timelineEventId: string | null;
};

function normalizePhone(
  phone: unknown
): string {
  const digits =
    safeString(phone)
      .replace(/\D/g, "");

  if (
    digits.startsWith("972") &&
    digits.length === 12
  ) {
    return digits;
  }

  if (
    digits.startsWith("0") &&
    digits.length === 10
  ) {
    return `972${digits.slice(1)}`;
  }

  if (
    digits.length === 9
  ) {
    return `972${digits}`;
  }

  return "";
}

function getFirstName(
  fullName: unknown,
  firstName: unknown
): string {
  const storedFirstName =
    safeString(firstName);

  if (storedFirstName) {
    return storedFirstName;
  }

  const normalizedFullName =
    safeString(fullName);

  if (!normalizedFullName) {
    return "לקוח יקר";
  }

  return (
    normalizedFullName
      .split(/\s+/)
      .filter(Boolean)[0] ||
    "לקוח יקר"
  );
}

function replaceTemplateVariables(
  bodyText: string,
  values: string[]
): string {
  let result =
    safeString(bodyText);

  values.forEach(
    (
      value,
      index
    ) => {
      result =
        result.replace(
          new RegExp(
            `\\{\\{${index + 1}\\}\\}`,
            "g"
          ),
          value
        );
    }
  );

  return result;
}

export async function loadMagicTouchWhatsAppTemplateContext({
  db,
  agentId,
  templateName,
}: {
  db: any;
  agentId: string;
  templateName: string;
}): Promise<MagicTouchWhatsAppTemplateContext> {
  const normalizedAgentId =
    safeString(agentId);

  const normalizedTemplateName =
    safeString(templateName);

  if (
    !normalizedAgentId ||
    !normalizedTemplateName
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId or templateName"
    );
  }

  const [
    whatsappConfigSnap,
    whatsappSecretSnap,
    templateSnap,
  ] =
    await Promise.all([
      db
        .doc(
          `agents/${normalizedAgentId}/config/whatsapp`
        )
        .get(),

      db
        .doc(
          `agents/${normalizedAgentId}/secrets/whatsapp`
        )
        .get(),

      db
        .doc(
          `agents/${normalizedAgentId}/whatsapp_templates/${normalizedTemplateName}`
        )
        .get(),
    ]);

  if (!whatsappConfigSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp config was not found for this agent"
    );
  }

  if (!whatsappSecretSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp token was not found for this agent"
    );
  }

  if (!templateSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "The selected WhatsApp template was not found"
    );
  }

  const whatsappConfig =
    whatsappConfigSnap.data() as any;

  const template =
    templateSnap.data() as any;

  const phoneNumberId =
    safeString(
      whatsappConfig?.phoneNumberId
    );

  if (!phoneNumberId) {
    throw new HttpsError(
      "failed-precondition",
      "Missing WhatsApp phoneNumberId"
    );
  }

  const templateStatus =
    safeString(
      template?.status
    ).toUpperCase();

  if (
    templateStatus !==
    "APPROVED"
  ) {
    throw new HttpsError(
      "failed-precondition",
      `The selected WhatsApp template is not approved. Current status: ${
        templateStatus ||
        "UNKNOWN"
      }`
    );
  }

  const templateLanguage =
    safeString(
      template?.language
    ) ||
    "he";

  const templateBodyText =
    safeString(
      template?.bodyText
    );

  const bodyVariableCount =
    Number(
      template?.bodyVariableCount ||
      0
    );

  if (
    !Number.isInteger(
      bodyVariableCount
    ) ||
    bodyVariableCount < 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid template body variable count"
    );
  }

  if (
    bodyVariableCount > 1
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This sending flow currently supports up to one template body variable"
    );
  }

  const keyB64 =
    safeString(
      PORTAL_ENC_KEY_B64.value()
    );

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const decrypted =
    decryptJsonAes256Gcm(
      keyB64,
      whatsappSecretSnap.data()?.enc
    ) as any;

  const accessToken =
    safeString(
      decrypted?.accessToken
    );

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid WhatsApp access token"
    );
  }

  return {
    agentId:
      normalizedAgentId,

    phoneNumberId,
    accessToken,

    templateName:
      normalizedTemplateName,

    templateLanguage,
    templateBodyText,
    bodyVariableCount,
  };
}

export async function sendMagicTouchTemplateToContact(
  input: SendMagicTouchTemplateToContactInput
): Promise<SendMagicTouchTemplateToContactResult> {
  const {
    db,
    context,
  } =
    input;

  const agentId =
    safeString(
      context.agentId
    );

  const contactId =
    safeString(
      input.contactId
    );

  const createdBy =
    safeString(
      input.createdBy
    );

  const campaignId =
    safeString(
      input.campaignId
    ) ||
    null;

  if (
    !agentId ||
    !contactId ||
    !createdBy
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId, contactId or createdBy"
    );
  }

  const contactRef =
    db.doc(
      `agents/${agentId}/magic_touch_contacts/${contactId}`
    );

  const contactSnap =
    await contactRef.get();

  if (!contactSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Magic Touch contact was not found"
    );
  }

  const contact =
    contactSnap.data() as any;

  const phoneNormalized =
    normalizePhone(
      contact?.phoneNormalized ||
      contact?.phone
    );

  if (!phoneNormalized) {
    throw new HttpsError(
      "failed-precondition",
      "The contact does not have a valid WhatsApp phone number"
    );
  }

  const firstName =
    getFirstName(
      contact?.fullName,
      contact?.firstName
    );

  const templateVariables =
    context.bodyVariableCount === 1
      ? [firstName]
      : [];

  const templatePayload:
    Record<string, any> = {
      name:
        context.templateName,

      language: {
        code:
          context.templateLanguage,
      },
    };

  if (
    templateVariables.length >
    0
  ) {
    templatePayload.components = [
      {
        type:
          "body",

        parameters:
          templateVariables.map(
            (value) => ({
              type:
                "text",

              text:
                value,
            })
          ),
      },
    ];
  }

  const response =
    await fetch(
      `${WA_API_URL}/${context.phoneNumberId}/messages`,
      {
        method:
          "POST",

        headers: {
          "Authorization":
            `Bearer ${context.accessToken}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            messaging_product:
              "whatsapp",

            recipient_type:
              "individual",

            to:
              phoneNormalized,

            type:
              "template",

            template:
              templatePayload,
          }),
      }
    );

  const responseData: any =
    await response.json();

  const waMessageId =
    safeString(
      responseData
        ?.messages
        ?.[0]
        ?.id
    );

  if (
    !response.ok ||
    !waMessageId
  ) {
    console.error(
      "[sendMagicTouchTemplateToContact] Meta error",
      {
        agentId,
        contactId,
        campaignId,
        response:
          responseData,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      responseData
        ?.error
        ?.message ||
        "Failed to send WhatsApp template"
    );
  }

  const conversationId =
    safeString(
      input.conversationId
    ) ||
    `${agentId}_${phoneNormalized}`;

  const conversationRef =
    db.doc(
      `whatsapp_conversations/${conversationId}`
    );

  const messageRef =
    conversationRef
      .collection("messages")
      .doc(waMessageId);

  const timestamp =
    nowTs();

  const messagePreview =
    context.templateBodyText
      ? replaceTemplateVariables(
          context.templateBodyText,
          templateVariables
        )
      : `נשלחה תבנית WhatsApp: ${context.templateName}`;

  await Promise.all([
    conversationRef.set(
      {
        agentId,
        contactId,

        phoneNumberId:
          context.phoneNumberId,

        customerPhone:
          phoneNormalized,

        customerName:
          safeString(
            contact?.fullName
          ) ||
          null,

        status:
          "open",

        lastMessageText:
          messagePreview,

        lastMessageType:
          "template",

        lastMessageDirection:
          "outbound",

        lastMessageAt:
          timestamp,

        unreadCount:
          0,

        needsReply:
          false,

        lastCampaignId:
          campaignId,

        updatedAt:
          timestamp,
      },
      {
        merge:
          true,
      }
    ),

    messageRef.set(
      {
        agentId,
        contactId,
        conversationId,

        campaignId,

        direction:
          "outbound",

        fromPhoneNumberId:
          context.phoneNumberId,

        to:
          phoneNormalized,

        type:
          "template",

        templateName:
          context.templateName,

        templateLanguage:
          context.templateLanguage,

        templateVariables,

        text:
          messagePreview,

        waMessageId,

        status:
          "accepted",

        sentBy:
          createdBy,

        createdAt:
          timestamp,

        updatedAt:
          timestamp,
      },
      {
        merge:
          true,
      }
    ),

    contactRef.set(
      {
        lastOutboundAt:
          timestamp,

        lastWhatsAppMessageId:
          waMessageId,

        whatsappConversationId:
          conversationId,

        lastCampaignId:
          campaignId,

        updatedAt:
          timestamp,
      },
      {
        merge:
          true,
      }
    ),
  ]);

  let timelineEventId:
    string | null = null;

  try {
    const timelineResult =
      await addMagicTouchTimelineEvent({
        agentId,
        contactId,

        type:
          "whatsapp_template_sent",

        channel:
          "whatsapp",

        title:
          campaignId
            ? "נשלחה תבנית WhatsApp בקמפיין"
            : "נשלחה תבנית WhatsApp",

        description:
          messagePreview,

        direction:
          "outbound",

        status:
          "completed",

        createdBy,

        sourceSystem:
          "whatsapp",

        sourceRecordId:
          waMessageId,

        metadata: {
          waMessageId,
          conversationId,

          campaignId,

          phoneNumberId:
            context.phoneNumberId,

          customerPhone:
            phoneNormalized,

          templateName:
            context.templateName,

          templateLanguage:
            context.templateLanguage,

          templateVariables,
        },
      });

    timelineEventId =
      timelineResult.eventId;
  } catch (
    timelineError: any
  ) {
    console.error(
      "[sendMagicTouchTemplateToContact] Timeline event failed",
      {
        agentId,
        contactId,
        campaignId,
        waMessageId,

        error:
          timelineError?.message ||
          String(
            timelineError
          ),
      }
    );
  }

  return {
    agentId,
    contactId,

    conversationId,
    waMessageId,

    phoneNormalized,

    templateName:
      context.templateName,

    templateLanguage:
      context.templateLanguage,

    templateVariables,

    timelineEventId,
  };
}