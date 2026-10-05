/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

const META_GRAPH_URL =
  "https://graph.facebook.com/v25.0";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

async function parseMetaResponse(
  response: Response
): Promise<any> {
  const responseText =
    await response.text();

  if (
    !responseText
  ) {
    return null;
  }

  try {
    return JSON.parse(
      responseText
    );
  } catch {
    return {
      raw:
        responseText,
    };
  }
}

export async function registerWhatsAppPhoneNumber({
  phoneNumberId,
  accessToken,
  pin,
}: {
  phoneNumberId: string;
  accessToken: string;
  pin: string;
}): Promise<any> {
  const normalizedPhoneNumberId =
    s(
      phoneNumberId
    );

  const normalizedAccessToken =
    s(
      accessToken
    );

  const normalizedPin =
    s(
      pin
    );

  if (
    !normalizedPhoneNumberId ||
    !normalizedAccessToken ||
    !normalizedPin
  ) {
    throw new HttpsError(
      "invalid-argument",
      "phoneNumberId, accessToken and pin are required"
    );
  }

  if (
    !/^\d{6}$/.test(
      normalizedPin
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "WhatsApp registration PIN must contain exactly 6 digits"
    );
  }

  const response =
    await fetch(
      `${META_GRAPH_URL}/${normalizedPhoneNumberId}/register`,
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${normalizedAccessToken}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            messaging_product:
              "whatsapp",

            pin:
              normalizedPin,
          }),
      }
    );

  const payload =
    await parseMetaResponse(
      response
    );

  if (
    !response.ok
  ) {
    console.error(
      "[metaWhatsAppProvisioning] Register phone failed",
      JSON.stringify(
        payload
      )
    );

    throw new HttpsError(
      "failed-precondition",
      payload
        ?.error
        ?.message ||
        "Failed to register WhatsApp phone number"
    );
  }

  return payload;
}

/*
 * שדות ה-webhook ל-WABA.
 * Coexistence (מספר שעובד גם באפליקציית WhatsApp Business) צריך גם:
 * הודעות שהעסק שלח מהטלפון, היסטוריה, אנשי קשר ועדכוני חשבון (ניתוק).
 */
export const CLOUD_API_WEBHOOK_FIELDS = [
  "messages",
];

export const COEXISTENCE_WEBHOOK_FIELDS = [
  "messages",
  "smb_message_echoes",
  "history",
  "smb_app_state_sync",
  "account_update",
];

export async function subscribeWhatsAppWabaToApp({
  wabaId,
  accessToken,
  subscribedFields = CLOUD_API_WEBHOOK_FIELDS,
}: {
  wabaId: string;
  accessToken: string;
  subscribedFields?: string[];
}): Promise<any> {
  const normalizedWabaId =
    s(
      wabaId
    );

  const normalizedAccessToken =
    s(
      accessToken
    );

  if (
    !normalizedWabaId ||
    !normalizedAccessToken
  ) {
    throw new HttpsError(
      "invalid-argument",
      "wabaId and accessToken are required"
    );
  }

  const subscribe =
    (
      body: Record<string, any>
    ) =>
      fetch(
        `${META_GRAPH_URL}/${normalizedWabaId}/subscribed_apps`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${normalizedAccessToken}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              body
            ),
        }
      );

  let response =
    await subscribe({
      subscribed_fields:
        subscribedFields,
    });

  let payload =
    await parseMetaResponse(
      response
    );

  /*
   * אם Meta דוחה את רשימת השדות המורחבת, מנסים שוב בלי רשימה:
   * אז חלים השדות שמסומנים ב-App Dashboard.
   */
  if (
    !response.ok &&
    subscribedFields !== CLOUD_API_WEBHOOK_FIELDS
  ) {
    console.warn(
      "[metaWhatsAppProvisioning] Subscribe with extended fields failed, retrying without subscribed_fields",
      JSON.stringify(
        payload
      )
    );

    response =
      await subscribe({});

    payload =
      await parseMetaResponse(
        response
      );
  }

  if (
    !response.ok
  ) {
    console.error(
      "[metaWhatsAppProvisioning] Subscribe WABA failed",
      JSON.stringify(
        payload
      )
    );

    throw new HttpsError(
      "failed-precondition",
      payload
        ?.error
        ?.message ||
        "Failed to subscribe WhatsApp Business Account to app"
    );
  }

  return payload;
}

/*
 * Coexistence: אירוע הסיום של Embedded Signup לא תמיד כולל phone_number_id.
 * במקרה כזה שולפים את המספרים של ה-WABA.
 */
export async function listWabaPhoneNumbers({
  wabaId,
  accessToken,
}: {
  wabaId: string;
  accessToken: string;
}): Promise<Array<{
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
}>> {
  const response =
    await fetch(
      `${META_GRAPH_URL}/${encodeURIComponent(s(wabaId))}/phone_numbers?fields=id,display_phone_number,verified_name`,
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${s(accessToken)}`,
        },
      }
    );

  const payload =
    await parseMetaResponse(
      response
    );

  if (
    !response.ok
  ) {
    console.error(
      "[metaWhatsAppProvisioning] List WABA phone numbers failed",
      JSON.stringify(
        payload
      )
    );

    throw new HttpsError(
      "failed-precondition",
      payload
        ?.error
        ?.message ||
        "Failed to list WhatsApp phone numbers"
    );
  }

  return (
    Array.isArray(
      payload?.data
    )
      ? payload.data
      : []
  ).map(
    (
      row: any
    ) => ({
      id:
        s(
          row?.id
        ),

      displayPhoneNumber:
        s(
          row?.display_phone_number
        ),

      verifiedName:
        s(
          row?.verified_name
        ),
    })
  ).filter(
    (
      row: {
        id: string;
      }
    ) =>
      Boolean(
        row.id
      )
  );
}

/*
 * Coexistence: בקשת סנכרון של אנשי קשר (smb_app_state_sync) או היסטוריה (history).
 * יש לבצע עד 24 שעות מהחיבור, וכל סוג פעם אחת בלבד.
 * התוצאה מגיעה ב-webhook. לא זורק שגיאה: מחזיר requestId או error.
 */
export async function requestSmbAppDataSync({
  phoneNumberId,
  accessToken,
  syncType,
}: {
  phoneNumberId: string;
  accessToken: string;
  syncType:
    | "smb_app_state_sync"
    | "history";
}): Promise<{
  requestId: string | null;
  error: string | null;
}> {
  try {
    const response =
      await fetch(
        `${META_GRAPH_URL}/${encodeURIComponent(s(phoneNumberId))}/smb_app_data`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${s(accessToken)}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              messaging_product:
                "whatsapp",

              sync_type:
                syncType,
            }),
        }
      );

    const payload =
      await parseMetaResponse(
        response
      );

    if (
      !response.ok
    ) {
      console.error(
        "[metaWhatsAppProvisioning] smb_app_data sync failed",
        syncType,
        JSON.stringify(
          payload
        )
      );

      return {
        requestId:
          null,

        error:
          s(
            payload
              ?.error
              ?.message
          ) ||
          `HTTP ${response.status}`,
      };
    }

    return {
      requestId:
        s(
          payload
            ?.request_id
        ) ||
        null,

      error:
        null,
    };
  } catch (
    error: any
  ) {
    return {
      requestId:
        null,

      error:
        s(
          error?.message
        ) ||
        String(
          error
        ),
    };
  }
}