/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  randomInt,
} from "crypto";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  PORTAL_ENC_KEY_B64,
  META_APP_ID,
  META_APP_SECRET,
} from "./shared/secrets";

import {
  encryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

import {
  registerWhatsAppPhoneNumber,
  subscribeWhatsAppWabaToApp,
} from "./shared/metaWhatsAppProvisioning";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

async function exchangeEmbeddedSignupCode(
  code: string
): Promise<string> {
  const clientId =
    META_APP_ID.value();

  const clientSecret =
    META_APP_SECRET.value();

  if (
    !clientId ||
    !clientSecret
  ) {
    throw new HttpsError(
      "internal",
      "Missing Meta app credentials"
    );
  }

  const tokenUrl =
    new URL(
      "https://graph.facebook.com/v25.0/oauth/access_token"
    );

  tokenUrl.searchParams.set(
    "client_id",
    clientId
  );

  tokenUrl.searchParams.set(
    "client_secret",
    clientSecret
  );

  tokenUrl.searchParams.set(
    "code",
    code
  );

  const res =
    await fetch(
      tokenUrl.toString(),
      {
        method:
          "GET",
      }
    );

  const json:
    any =
    await res.json();

  if (
    !res.ok ||
    !json?.access_token
  ) {
    console.error(
      "[exchangeEmbeddedSignupCode] Meta error",
      JSON.stringify(
        json
      )
    );

    throw new HttpsError(
      "failed-precondition",
      json
        ?.error
        ?.message ||
        "Failed to exchange Embedded Signup code"
    );
  }

  return String(
    json.access_token
  );
}

function createRegistrationPin(): string {
  return String(
    randomInt(
      100000,
      1000000
    )
  );
}

export async function saveAgentWhatsAppConfigImpl(
  req: any
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
    await (db as any)
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

  const body =
    req.data ||
    {};

  const agentId =
    s(
      body.agentId
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
      userData?.agentId ||
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
      "You may only connect WhatsApp for your own agent"
    );
  }

  const businessId =
    s(
      body.businessId
    );

  const wabaId =
    s(
      body.wabaId
    );

  const phoneNumberId =
    s(
      body.phoneNumberId
    );

  const displayPhoneNumber =
    s(
      body.displayPhoneNumber
    );

  const displayName =
    s(
      body.displayName
    );

  const templateName =
    s(
      body.templateName
    );

  const embeddedSignupCode =
    s(
      body.embeddedSignupCode
    );

  if (
    !businessId ||
    !wabaId ||
    !phoneNumberId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing businessId / wabaId / phoneNumberId"
    );
  }

  if (
    !embeddedSignupCode
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing embeddedSignupCode"
    );
  }

  const keyB64 =
    PORTAL_ENC_KEY_B64.value();

  if (
    !keyB64
  ) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  /*
   * 1. החלפת Embedded Signup code ב-token.
   */
  const accessToken =
    await exchangeEmbeddedSignupCode(
      embeddedSignupCode
    );

  /*
   * 2. PIN קבוע לחיבור הזה.
   * נשמר רק בתוך ה-secret המוצפן.
   */
  const registrationPin =
    createRegistrationPin();

  const enc =
    encryptJsonAes256Gcm(
      keyB64,
      {
        accessToken,
        registrationPin,
      }
    );

  const configRef =
    (db as any).doc(
      `agents/${agentId}/config/whatsapp`
    );

  const secretRef =
    (db as any).doc(
      `agents/${agentId}/secrets/whatsapp`
    );

  const phoneMappingRef =
    (db as any).doc(
      `whatsapp_phone_mappings/${phoneNumberId}`
    );

  /*
   * קודם שומרים provisioning.
   *
   * אם Meta נכשלת בהמשך, עדיין נשמרים
   * ה-token וה-PIN ואפשר לבצע recovery
   * דרך מסך האדמין.
   */
  const initialBatch =
    (db as any).batch();

  const configData:
    Record<
      string,
      any
    > = {
      provider:
        "meta_cloud_api",

      status:
        "provisioning",

      businessId,

      wabaId,

      phoneNumberId,

      displayPhoneNumber,

      displayName,

      connectedVia:
        "embedded_signup",

      phoneRegistered:
        false,

      webhookSubscribed:
        false,

      provisioningError:
        null,

      connectedAt:
        nowTs(),

      updatedAt:
        nowTs(),

      updatedBy:
        authUid,
    };

  if (
    templateName
  ) {
    configData.templateName =
      templateName;
  }

  initialBatch.set(
    configRef,
    configData,
    {
      merge:
        true,
    }
  );

  initialBatch.set(
    secretRef,
    {
      enc,

      tokenType:
        "embedded_signup_access_token",

      source:
        "embedded_signup",

      businessId,

      wabaId,

      phoneNumberId,

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

  initialBatch.set(
    phoneMappingRef,
    {
      agentId,

      businessId,

      wabaId,

      phoneNumberId,

      displayPhoneNumber,

      displayName,

      status:
        "provisioning",

      source:
        "embedded_signup",

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

  await initialBatch.commit();

  /*
   * 3. רישום המספר ב-Cloud API.
   */
  try {
    await registerWhatsAppPhoneNumber({
      phoneNumberId,
      accessToken,
      pin:
        registrationPin,
    });

    await configRef.set(
      {
        phoneRegistered:
          true,

        phoneRegisteredAt:
          nowTs(),

        status:
          "registering_webhook",

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );
  } catch (
    error:
      any
  ) {
    await configRef.set(
      {
        status:
          "register_failed",

        phoneRegistered:
          false,

        provisioningError: {
          stage:
            "register_phone",

          message:
            error?.message ||
            String(
              error
            ),

          occurredAt:
            nowTs(),
        },

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    throw error;
  }

  /*
   * 4. חיבור ה-WABA ל-Webhook של האפליקציה.
   */
  try {
    await subscribeWhatsAppWabaToApp({
      wabaId,
      accessToken,
    });

    const finalBatch =
      (db as any).batch();

    finalBatch.set(
      configRef,
      {
        status:
          "ready",

        phoneRegistered:
          true,

        webhookSubscribed:
          true,

        webhookSubscribedAt:
          nowTs(),

        provisioningError:
          null,

        readyAt:
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

    finalBatch.set(
      phoneMappingRef,
      {
        status:
          "active",

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

    await finalBatch.commit();
  } catch (
    error:
      any
  ) {
    await configRef.set(
      {
        status:
          "webhook_failed",

        phoneRegistered:
          true,

        webhookSubscribed:
          false,

        provisioningError: {
          stage:
            "subscribe_webhook",

          message:
            error?.message ||
            String(
              error
            ),

          occurredAt:
            nowTs(),
        },

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    throw error;
  }

  return {
    ok:
      true,

    ready:
      true,

    agentId,

    businessId,

    wabaId,

    phoneNumberId,

    phoneRegistered:
      true,

    webhookSubscribed:
      true,

    status:
      "ready",
  };
}