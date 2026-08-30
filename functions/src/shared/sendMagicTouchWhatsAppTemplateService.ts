/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";

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

  headerMedia: {
    type: "DOCUMENT" | "IMAGE";
    storagePath: string;
    fileName: string;
    mimeType: string;
    size: number;
  } | null;
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


function normalizeStoredHeaderMedia(
  rawMedia: unknown
): MagicTouchWhatsAppTemplateContext["headerMedia"] {
  if (
    !rawMedia ||
    typeof rawMedia !== "object"
  ) {
    return null;
  }

  const type =
    safeString(
      (rawMedia as any)?.type
    ).toUpperCase();

  const storagePath =
    safeString(
      (rawMedia as any)?.storagePath
    );

  const fileName =
    safeString(
      (rawMedia as any)?.fileName
    );

  const mimeType =
    safeString(
      (rawMedia as any)?.mimeType
    ).toLowerCase();

  const size =
    Number(
      (rawMedia as any)?.size ||
      0
    );

  if (
    type !== "DOCUMENT" &&
    type !== "IMAGE"
  ) {
    return null;
  }

  if (!storagePath) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp template header media is missing storagePath"
    );
  }

  return {
    type:
      type as
        | "DOCUMENT"
        | "IMAGE",

    storagePath,

    fileName:
      fileName ||
      (
        type === "DOCUMENT"
          ? "document.pdf"
          : "image"
      ),

    mimeType:
      mimeType ||
      (
        type === "DOCUMENT"
          ? "application/pdf"
          : "image/jpeg"
      ),

    size:
      Number.isFinite(size) &&
      size > 0
        ? size
        : 0,
  };
}

async function uploadStoredTemplateMediaToWhatsApp({
  phoneNumberId,
  accessToken,
  headerMedia,
}: {
  phoneNumberId: string;
  accessToken: string;
  headerMedia: NonNullable<
    MagicTouchWhatsAppTemplateContext["headerMedia"]
  >;
}): Promise<string> {
  const storageFile =
    getStorage()
      .bucket()
      .file(
        headerMedia.storagePath
      );

  let fileBuffer:
    Buffer;

  try {
    [
      fileBuffer,
    ] =
      await storageFile.download();
  } catch (
    error: any
  ) {
    console.error(
      "[sendMagicTouchTemplateToContact] Could not read template media from Storage",
      {
        storagePath:
          headerMedia.storagePath,

        error:
          error?.message ||
          String(
            error
          ),
      }
    );

    throw new HttpsError(
      "failed-precondition",
      "Template media file was not found"
    );
  }

  const formData =
    new FormData();

  formData.append(
    "messaging_product",
    "whatsapp"
  );

  formData.append(
    "type",
    headerMedia.mimeType
  );

  formData.append(
    "file",
    new Blob(
      [
        fileBuffer,
      ],
      {
        type:
          headerMedia.mimeType,
      }
    ),
    headerMedia.fileName
  );

  console.log(
    "[sendMagicTouchTemplateToContact] Uploading template header media",
    {
      phoneNumberId,
      type:
        headerMedia.type,
      storagePath:
        headerMedia.storagePath,
      fileName:
        headerMedia.fileName,
      mimeType:
        headerMedia.mimeType,
      bytes:
        fileBuffer.length,
    }
  );

  const mediaResponse =
    await fetch(
      `${WA_API_URL}/${phoneNumberId}/media`,
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },

        body:
          formData,
      }
    );

  const mediaResponseData: any =
    await mediaResponse.json();

  const mediaId =
    safeString(
      mediaResponseData?.id
    );

  if (
    !mediaResponse.ok ||
    !mediaId
  ) {
    console.error(
      "[sendMagicTouchTemplateToContact] Meta media upload error",
      {
        phoneNumberId,
        storagePath:
          headerMedia.storagePath,
        response:
          mediaResponseData,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      mediaResponseData
        ?.error
        ?.message ||
        "Failed to upload WhatsApp template media"
    );
  }

  console.log(
    "[sendMagicTouchTemplateToContact] Template header media uploaded",
    {
      phoneNumberId,
      mediaId,
      storagePath:
        headerMedia.storagePath,
    }
  );

  return mediaId;
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

  const headerMedia =
    normalizeStoredHeaderMedia(
      template?.headerMedia
    );

  console.log(
    "[loadMagicTouchWhatsAppTemplateContext] Template context loaded",
    {
      agentId:
        normalizedAgentId,
      templateName:
        normalizedTemplateName,
      templateStatus,
      bodyVariableCount,
      hasHeaderMedia:
        Boolean(
          headerMedia
        ),
      headerMediaType:
        headerMedia?.type ||
        null,
      storagePath:
        headerMedia?.storagePath ||
        null,
    }
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
    headerMedia,
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

  const templateComponents:
    any[] = [];

  let sentHeaderMediaId:
    string | null = null;

  if (
    context.headerMedia
  ) {
    sentHeaderMediaId =
      await uploadStoredTemplateMediaToWhatsApp({
        phoneNumberId:
          context.phoneNumberId,

        accessToken:
          context.accessToken,

        headerMedia:
          context.headerMedia,
      });

    templateComponents.push({
      type:
        "header",

      parameters: [
        {
          type:
            context.headerMedia.type ===
              "DOCUMENT"
              ? "document"
              : "image",

          [
            context.headerMedia.type ===
              "DOCUMENT"
              ? "document"
              : "image"
          ]: {
            id:
              sentHeaderMediaId,

            ...(context.headerMedia.type ===
              "DOCUMENT"
              ? {
                  filename:
                    context.headerMedia.fileName,
                }
              : {}),
          },
        },
      ],
    });
  }

  if (
    templateVariables.length >
    0
  ) {
    templateComponents.push({
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
    });
  }

  if (
    templateComponents.length >
    0
  ) {
    templatePayload.components =
      templateComponents;
  }

  console.log(
    "[sendMagicTouchTemplateToContact] Sending template",
    {
      agentId,
      contactId,
      campaignId,
      to:
        phoneNormalized,
      templateName:
        context.templateName,
      templateLanguage:
        context.templateLanguage,
      bodyVariableCount:
        templateVariables.length,
      hasHeaderMedia:
        Boolean(
          context.headerMedia
        ),
      headerMediaType:
        context.headerMedia?.type ||
        null,
      sentHeaderMediaId,
      components:
        templateComponents.map(
          (component) =>
            component?.type
        ),
    }
  );

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
        httpStatus:
          response.status,
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

        headerMedia:
          context.headerMedia
            ? {
                type:
                  context.headerMedia.type,

                storagePath:
                  context.headerMedia.storagePath,

                fileName:
                  context.headerMedia.fileName,

                mimeType:
                  context.headerMedia.mimeType,

                waMediaId:
                  sentHeaderMediaId,
              }
            : null,

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

          headerMedia:
            context.headerMedia
              ? {
                  type:
                    context.headerMedia.type,

                  fileName:
                    context.headerMedia.fileName,

                  storagePath:
                    context.headerMedia.storagePath,

                  waMediaId:
                    sentHeaderMediaId,
                }
              : null,
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