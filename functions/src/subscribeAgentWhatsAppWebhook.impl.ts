/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  decryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

const META_GRAPH_URL =
  "https://graph.facebook.com/v25.0";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

async function loadAgentAccessToken({
  db,
  agentId,
}: {
  db:
    FirebaseFirestore.Firestore;
  agentId:
    string;
}): Promise<string> {
  const secretSnap =
    await db
      .doc(
        `agents/${agentId}/secrets/whatsapp`
      )
      .get();

  if (
    !secretSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp secret not found for agent"
    );
  }

  const keyB64 =
    s(
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

  const decrypted =
    decryptJsonAes256Gcm(
      keyB64,
      (
        secretSnap.data() as any
      )?.enc
    ) as any;

  const accessToken =
    s(
      decrypted
        ?.accessToken
    );

  if (
    !accessToken
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid WhatsApp access token"
    );
  }

  return accessToken;
}

async function getSubscribedApps({
  wabaId,
  accessToken,
}: {
  wabaId:
    string;
  accessToken:
    string;
}): Promise<any[]> {
  const response =
    await fetch(
      `${META_GRAPH_URL}/${wabaId}/subscribed_apps`,
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );

  const responseText =
    await response.text();

  let payload:
    any = null;

  try {
    payload =
      responseText
        ? JSON.parse(
            responseText
          )
        : null;
  } catch {
    payload = {
      raw:
        responseText,
    };
  }

  if (
    !response.ok
  ) {
    console.error(
      "[subscribeAgentWhatsAppWebhook] GET subscribed_apps failed",
      JSON.stringify(
        payload
      )
    );

    throw new HttpsError(
      "failed-precondition",
      payload
        ?.error
        ?.message ||
        "Failed to read WABA subscribed apps"
    );
  }

  return Array.isArray(
    payload?.data
  )
    ? payload.data
    : [];
}

async function subscribeWaba({
  wabaId,
  accessToken,
}: {
  wabaId:
    string;
  accessToken:
    string;
}): Promise<any> {
  const response =
    await fetch(
      `${META_GRAPH_URL}/${wabaId}/subscribed_apps`,
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

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

  const responseText =
    await response.text();

  let payload:
    any = null;

  try {
    payload =
      responseText
        ? JSON.parse(
            responseText
          )
        : null;
  } catch {
    payload = {
      raw:
        responseText,
    };
  }

  if (
    !response.ok
  ) {
    console.error(
      "[subscribeAgentWhatsAppWebhook] POST subscribed_apps failed",
      JSON.stringify(
        payload
      )
    );

    throw new HttpsError(
      "failed-precondition",
      payload
        ?.error
        ?.message ||
        "Failed to subscribe WABA to webhook"
    );
  }

  return payload;
}

export async function subscribeAgentWhatsAppWebhookImpl(
  req:
    any
): Promise<object> {
  const authUid =
    req.auth?.uid;

  if (
    !authUid
  ) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const db =
    adminDb();

  const userSnap =
    await db
      .collection(
        "users"
      )
      .doc(
        authUid
      )
      .get();

  if (
    !userSnap.exists
  ) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  const agentId =
    s(
      req.data?.agentId
    );

  if (
    !agentId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const isAdmin =
    userData?.role ===
      "admin" ||
    userData?.isSystem ===
      true;

  const loggedInAgentId =
    s(
      userData
        ?.agentId ||
      authUid
    );

  const canManageAgent =
    isAdmin ||
    loggedInAgentId ===
      agentId;

  if (
    !canManageAgent
  ) {
    throw new HttpsError(
      "permission-denied",
      "You may only configure WhatsApp for your own agent"
    );
  }

  const configRef =
    db.doc(
      `agents/${agentId}/config/whatsapp`
    );

  const configSnap =
    await configRef.get();

  if (
    !configSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp config not found for agent"
    );
  }

  const config =
    configSnap.data() as any;

  const wabaId =
    s(
      config
        ?.wabaId
    );

  if (
    !wabaId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Missing WABA ID"
    );
  }

  const accessToken =
    await loadAgentAccessToken({
      db,
      agentId,
    });

  const before =
    await getSubscribedApps({
      wabaId,
      accessToken,
    });

  if (
    before.length >
    0
  ) {
    await configRef.set(
      {
        webhookSubscribed:
          true,

        webhookSubscribedAt:
          nowTs(),

        updatedAt:
          nowTs(),

        updatedBy:
          authUid,
      },
      {
        merge:
          true,
      }
    );

    return {
      ok:
        true,

      alreadySubscribed:
        true,

      agentId,

      wabaId,

      subscribedApps:
        before,
    };
  }

  const subscribeResult =
    await subscribeWaba({
      wabaId,
      accessToken,
    });

  const after =
    await getSubscribedApps({
      wabaId,
      accessToken,
    });

  await configRef.set(
    {
      webhookSubscribed:
        true,

      webhookSubscribedAt:
        nowTs(),

      updatedAt:
        nowTs(),

      updatedBy:
        authUid,
    },
    {
      merge:
        true,
    }
  );

  return {
    ok:
      true,

    alreadySubscribed:
      false,

    agentId,

    wabaId,

    subscribeResult,

    subscribedApps:
      after,
  };
}