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
  listWabaPhoneNumbers,
  requestSmbAppDataSync,
  CLOUD_API_WEBHOOK_FIELDS,
  COEXISTENCE_WEBHOOK_FIELDS,
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

/*
 * Embedded Signup מחזיר רק waba_id ו-phone_number_id.
 * את המספר המוצג ואת שם התצוגה המאושר שולפים מ-Meta.
 * לא זורק שגיאה: אם Meta לא מחזירה, החיבור ממשיך בלי השדות.
 */
async function fetchWhatsAppPhoneNumberDetails(
  phoneNumberId: string,
  accessToken: string
): Promise<{
  displayPhoneNumber: string;
  displayName: string;
}> {
  try {
    const url =
      new URL(
        `https://graph.facebook.com/v25.0/${encodeURIComponent(phoneNumberId)}`
      );

    url.searchParams.set(
      "fields",
      "display_phone_number,verified_name"
    );

    const res =
      await fetch(
        url.toString(),
        {
          method:
            "GET",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },
        }
      );

    const json:
      any =
      await res.json();

    if (
      !res.ok
    ) {
      console.warn(
        "[fetchWhatsAppPhoneNumberDetails] Meta error",
        JSON.stringify(
          json?.error ||
          json
        )
      );

      return {
        displayPhoneNumber:
          "",
        displayName:
          "",
      };
    }

    return {
      displayPhoneNumber:
        s(
          json?.display_phone_number
        ),
      displayName:
        s(
          json?.verified_name
        ),
    };
  } catch (
    error: any
  ) {
    console.warn(
      "[fetchWhatsAppPhoneNumberDetails] failed",
      error?.message ||
      String(
        error
      )
    );

    return {
      displayPhoneNumber:
        "",
      displayName:
        "",
    };
  }
}

function createRegistrationPin(): string {
  return String(
    randomInt(
      100000,
      1000000
    )
  );
}

function isExistingPinRequiredError(
  error: any
): boolean {
  const message =
    s(
      error?.message
    ).toLowerCase();

  return (
    message.includes(
      "133005"
    ) ||
    message.includes(
      "pin mismatch"
    ) ||
    message.includes(
      "two step verification"
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

  let phoneNumberId =
    s(
      body.phoneNumberId
    );

  /*
   * Coexistence: המספר כבר עובד באפליקציית WhatsApp Business.
   * לא רושמים אותו מחדש ב-Cloud API, ומבקשים סנכרון של אנשי קשר והיסטוריה.
   */
  const isCoexistence =
    s(
      body.connectionMode
    ) ===
    "coexistence";

  const connectionMode =
    isCoexistence
      ? "coexistence"
      : "cloud_api";

  let displayPhoneNumber =
    s(
      body.displayPhoneNumber
    );

  let displayName =
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

  // ב-Coexistence ייתכן ש-Meta לא החזירה phone_number_id; משלימים אחרי החלפת הקוד
  if (
    !wabaId ||
    (
      !isCoexistence &&
      (
        !businessId ||
        !phoneNumberId
      )
    )
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
   * 1a. Coexistence בלי phone_number_id: לוקחים את המספר של ה-WABA.
   * אם יש יותר ממספר אחד, אי אפשר לנחש, ומבקשים לחבר שוב.
   */
  if (
    !phoneNumberId
  ) {
    const wabaPhoneNumbers =
      await listWabaPhoneNumbers({
        wabaId,
        accessToken,
      });

    if (
      wabaPhoneNumbers.length !==
      1
    ) {
      throw new HttpsError(
        "failed-precondition",
        wabaPhoneNumbers.length ===
          0
          ? "לא נמצא מספר טלפון בחשבון ה-WhatsApp שחובר."
          : "בחשבון ה-WhatsApp שחובר יש יותר ממספר אחד. יש לחבר שוב ולבחור מספר.",
        {
          reason:
            "phone_number_not_resolved",

          wabaId,

          phoneNumberCount:
            wabaPhoneNumbers.length,
        }
      );
    }

    phoneNumberId =
      wabaPhoneNumbers[0].id;

    displayPhoneNumber =
      displayPhoneNumber ||
      wabaPhoneNumbers[0].displayPhoneNumber;

    displayName =
      displayName ||
      wabaPhoneNumbers[0].verifiedName;
  }

  /*
   * 1b. מספר מוצג ושם תצוגה מאושר, אם לא הגיעו מהלקוח.
   */
  if (
    !displayPhoneNumber ||
    !displayName
  ) {
    const details =
      await fetchWhatsAppPhoneNumberDetails(
        phoneNumberId,
        accessToken
      );

    displayPhoneNumber =
      displayPhoneNumber ||
      details.displayPhoneNumber;

    displayName =
      displayName ||
      details.displayName;
  }

  if (
    !phoneNumberId ||
    phoneNumberId.includes(
      "/"
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid phoneNumberId"
    );
  }

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

      connectionMode,

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

      connectionMode,

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
   * ב-Coexistence מדלגים: המספר כבר רשום דרך אפליקציית WhatsApp Business,
   * ורישום מחדש היה מנתק אותו מהאפליקציה.
   */
  if (
    isCoexistence
  ) {
    await configRef.set(
      {
        phoneRegistered:
          true,

        phoneRegisteredAt:
          nowTs(),

        phoneRegisteredVia:
          "whatsapp_business_app",

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
  } else try {
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
  const existingPinRequired =
    isExistingPinRequiredError(
      error
    );

  if (
    existingPinRequired
  ) {
    const pinRequiredBatch =
      (db as any).batch();

    pinRequiredBatch.set(
      configRef,
      {
        status:
          "pin_required",

        phoneRegistered:
          false,

        webhookSubscribed:
          false,

        provisioningError: {
          stage:
            "register_phone",

          reason:
            "existing_pin_required",

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

        updatedBy:
          authUid,
      },
      {
        merge:
          true,
      }
    );

    pinRequiredBatch.set(
      phoneMappingRef,
      {
        status:
          "pin_required",

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

    await pinRequiredBatch.commit();

    throw new HttpsError(
      "failed-precondition",
      "Existing WhatsApp two-step verification PIN is required",
      {
        reason:
          "existing_pin_required",

        agentId,

        phoneNumberId,

        wabaId,
      }
    );
  }

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

      updatedBy:
        authUid,
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
      subscribedFields:
        isCoexistence
          ? COEXISTENCE_WEBHOOK_FIELDS
          : CLOUD_API_WEBHOOK_FIELDS,
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

  /*
   * 5. Coexistence: בקשת סנכרון אנשי קשר והיסטוריה.
   * חייב להתבצע עד 24 שעות מהחיבור, וכל סוג פעם אחת בלבד.
   * התוכן עצמו מגיע ב-webhook (smb_app_state_sync / history).
   * כשל כאן לא מבטל את החיבור: נשמר ומוצג, ואפשר לטפל ידנית.
   */
  let coexistenceSync:
    Record<
      string,
      any
    > | null =
    null;

  if (
    isCoexistence
  ) {
    const contactsSync =
      await requestSmbAppDataSync({
        phoneNumberId,
        accessToken,
        syncType:
          "smb_app_state_sync",
      });

    const historySync =
      await requestSmbAppDataSync({
        phoneNumberId,
        accessToken,
        syncType:
          "history",
      });

    coexistenceSync = {
      contacts: {
        status:
          contactsSync.requestId
            ? "requested"
            : "failed",

        requestId:
          contactsSync.requestId,

        error:
          contactsSync.error,

        requestedAt:
          nowTs(),
      },

      history: {
        status:
          historySync.requestId
            ? "requested"
            : "failed",

        requestId:
          historySync.requestId,

        error:
          historySync.error,

        requestedAt:
          nowTs(),
      },
    };

    await configRef.set(
      {
        coexistenceSync,

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );
  }

  return {
    ok:
      true,

    ready:
      true,

    connectionMode,

    coexistenceSyncRequested:
      Boolean(
        coexistenceSync
      ),

    agentId,

    businessId,

    wabaId,

    phoneNumberId,

    displayPhoneNumber,

    displayName,

    phoneRegistered:
      true,

    webhookSubscribed:
      true,

    status:
      "ready",
  };
}