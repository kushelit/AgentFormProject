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

export async function subscribeWhatsAppWabaToApp({
  wabaId,
  accessToken,
}: {
  wabaId: string;
  accessToken: string;
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

  const response =
    await fetch(
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
          JSON.stringify({
            subscribed_fields: [
              "messages",
            ],
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