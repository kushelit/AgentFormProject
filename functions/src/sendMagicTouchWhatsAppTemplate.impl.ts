/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

import { adminDb, nowTs } from "./shared/admin";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

import { safeString } from "./shared/magicTouchContacts";
import { requireBackendPermission } from "./shared/backendPermissions";
import { addMagicTouchTimelineEvent } from "./shared/magicTouchTimelineService";

const WA_API_URL =
  "https://graph.facebook.com/v25.0";

type SendMagicTouchWhatsAppTemplateData = {
  agentId?: unknown;
  contactId?: unknown;
  conversationId?: unknown;
  templateName?: unknown;
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

  if (digits.length === 9) {
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

  for (
    let index = 0;
    index < values.length;
    index++
  ) {
    result =
      result.replace(
        new RegExp(
          `\\{\\{${index + 1}\\}\\}`,
          "g"
        ),
        values[index]
      );
  }

  return result;
}

export async function sendMagicTouchWhatsAppTemplateImpl(
  req: any
): Promise<object> {
  const authUid =
    safeString(
      req.auth?.uid
    );

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const data =
    (req.data || {}) as
      SendMagicTouchWhatsAppTemplateData;

  const requestedAgentId =
    safeString(
      data.agentId
    );

  const contactId =
    safeString(
      data.contactId
    );

  const requestedConversationId =
    safeString(
      data.conversationId
    );

  const templateName =
    safeString(
      data.templateName
    );

  if (!contactId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing contactId"
    );
  }

  if (!templateName) {
    throw new HttpsError(
      "invalid-argument",
      "Missing templateName"
    );
  }

  const db =
    adminDb();

  const userSnap =
    await (db as any)
      .collection("users")
      .doc(authUid)
      .get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  await requireBackendPermission({
    db: db as any,
    userId: authUid,
    userData,
    permission:
      "access_magic_touch",
  });

  const isAdmin =
    userData?.role === "admin" ||
    userData?.isSystem === true;

  const userAgentId =
    safeString(
      userData?.agentId
    ) ||
    authUid;

  const agentId =
    requestedAgentId ||
    userAgentId;

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (
    !isAdmin &&
    agentId !== userAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot send WhatsApp messages for another agent"
    );
  }

  const contactRef =
    (db as any).doc(
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

  const [
    whatsappConfigSnap,
    whatsappSecretSnap,
    templateSnap,
  ] =
    await Promise.all([
      (db as any)
        .doc(
          `agents/${agentId}/config/whatsapp`
        )
        .get(),

      (db as any)
        .doc(
          `agents/${agentId}/secrets/whatsapp`
        )
        .get(),

      (db as any)
        .doc(
          `agents/${agentId}/whatsapp_templates/${templateName}`
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

  /*
   * כרגע התמיכה הכללית היא בתבנית ללא משתנים
   * או במשתנה יחיד של שם פרטי.
   */
  if (
    bodyVariableCount > 1
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This sending flow currently supports up to one template body variable"
    );
  }

  const firstName =
    getFirstName(
      contact?.fullName,
      contact?.firstName
    );

  const variableValues =
    bodyVariableCount === 1
      ? [firstName]
      : [];

  const templatePayload:
    Record<string, any> = {
      name:
        templateName,

      language: {
        code:
          templateLanguage,
      },
    };

  if (
    variableValues.length >
    0
  ) {
    templatePayload.components = [
      {
        type:
          "body",

        parameters:
          variableValues.map(
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

  const response =
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
      "[sendMagicTouchWhatsAppTemplate] Meta error",
      JSON.stringify(
        responseData
      )
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
    requestedConversationId ||
    `${agentId}_${phoneNormalized}`;

  const conversationRef =
    (db as any).doc(
      `whatsapp_conversations/${conversationId}`
    );

  const messageRef =
    conversationRef
      .collection("messages")
      .doc(waMessageId);

  const timestamp =
    nowTs();

  const messagePreview =
    templateBodyText
      ? replaceTemplateVariables(
          templateBodyText,
          variableValues
        )
      : `נשלחה תבנית WhatsApp: ${templateName}`;

  await conversationRef.set(
    {
      agentId,
      contactId,

      phoneNumberId,

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

      updatedAt:
        timestamp,
    },
    {
      merge:
        true,
    }
  );

  await messageRef.set(
    {
      agentId,
      contactId,
      conversationId,

      direction:
        "outbound",

      fromPhoneNumberId:
        phoneNumberId,

      to:
        phoneNormalized,

      type:
        "template",

      templateName,
      templateLanguage,
      templateVariables:
        variableValues,

      text:
        messagePreview,

      waMessageId,

      status:
        "accepted",

      sentBy:
        authUid,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,
    },
    {
      merge:
        true,
    }
  );

  await contactRef.set(
    {
      lastOutboundAt:
        timestamp,

      lastWhatsAppMessageId:
        waMessageId,

      whatsappConversationId:
        conversationId,

      updatedAt:
        timestamp,
    },
    {
      merge:
        true,
    }
  );

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
          "נשלחה תבנית WhatsApp",

        description:
          messagePreview,

        direction:
          "outbound",

        status:
          "completed",

        createdBy:
          authUid,

        sourceSystem:
          "whatsapp",

        sourceRecordId:
          waMessageId,

        metadata: {
          waMessageId,
          conversationId,
          phoneNumberId,

          customerPhone:
            phoneNormalized,

          templateName,
          templateLanguage,

          templateVariables:
            variableValues,

          sentByName:
            safeString(
              userData?.name
            ) ||
            null,
        },
      });

    timelineEventId =
      timelineResult.eventId;
  } catch (
    timelineError: any
  ) {
    /*
     * הודעת WhatsApp כבר נשלחה בהצלחה.
     * כשל ב-Timeline לא יהפוך את תשובת הפונקציה לכישלון שליחה.
     */
    console.error(
      "[sendMagicTouchWhatsAppTemplate] Timeline event failed",
      {
        authUid,
        agentId,
        contactId,
        conversationId,
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

  return {
    ok:
      true,

    agentId,
    contactId,

    conversationId,
    waMessageId,

    templateName,
    templateLanguage,
    templateVariables:
      variableValues,

    timelineEventId,
  };
}