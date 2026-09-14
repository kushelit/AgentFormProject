/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
} from "./shared/admin";

import {
  requireBackendPermission,
} from "./shared/backendPermissions";

const EXPO_PUSH_URL =
  "https://exp.host/--/api/v2/push/send";

function safeString(
  value: unknown
): string {
  return String(
    value ??
    ""
  ).trim();
}

function isExpoPushToken(
  token: string
): boolean {
  return (
    (
      token.startsWith(
        "ExponentPushToken["
      ) ||
      token.startsWith(
        "ExpoPushToken["
      )
    ) &&
    token.endsWith(
      "]"
    )
  );
}

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  priority: "high";
  channelId: string;
  data: {
    type: string;
    source: string;
  };
};

export async function sendMagicTouchTestPushImpl(
  req: any
): Promise<object> {
  const authUid =
    safeString(
      req.auth?.uid
    );

  if (
    !authUid
  ) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication required"
    );
  }

  const db =
    adminDb();

  const userRef =
    (db as any)
      .collection(
        "users"
      )
      .doc(
        authUid
      );

  const userSnap =
    await userRef.get();

  if (
    !userSnap.exists
  ) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() ||
    {};

  await requireBackendPermission({
    db,
    userId:
      authUid,
    permission:
      "access_magic_touch",
    userData,
  });

  if (
    userData?.isActive ===
    false
  ) {
    throw new HttpsError(
      "permission-denied",
      "User is inactive"
    );
  }

  const devicesSnap =
    await userRef
      .collection(
        "magic_touch_push_devices"
      )
      .where(
        "active",
        "==",
        true
      )
      .get();

  if (
    devicesSnap.empty
  ) {
    throw new HttpsError(
      "failed-precondition",
      "No active push devices found for this user"
    );
  }

  const rawTokens:
    string[] =
    devicesSnap.docs
      .map(
        (
          doc: any
        ): string =>
          safeString(
            doc.data()
              ?.expoPushToken
          )
      )
      .filter(
        (
          token: string
        ) =>
          isExpoPushToken(
            token
          )
      );

  const tokens:
    string[] =
    Array.from(
      new Set<string>(
        rawTokens
      )
    );

  if (
    tokens.length ===
    0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "No valid Expo push tokens found"
    );
  }

  const messages:
    ExpoPushMessage[] =
    tokens.map(
      (
        token:
          string
      ): ExpoPushMessage => ({
        to:
          token,

        title:
          "MagicTouch",

        body:
          "✨ התראת הבדיקה הראשונה שלך מ-MagicTouch",

        priority:
          "high",

        channelId:
          "magictouch",

        data: {
          type:
            "test_push",

          source:
            "MagicTouch",
        },
      })
    );

  let response:
    Response;

  try {
    response =
      await fetch(
        EXPO_PUSH_URL,
        {
          method:
            "POST",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            "Accept-Encoding":
              "gzip, deflate",
          },

          body:
            JSON.stringify(
              messages
            ),
        }
      );
  } catch (
    error: any
  ) {
    console.error(
      "[sendMagicTouchTestPush] Expo request failed",
      {
        uid:
          authUid,

        error:
          error?.message ||
          String(
            error
          ),
      }
    );

    throw new HttpsError(
      "unavailable",
      "Could not reach Expo Push service"
    );
  }

  let responseJson:
    any;

  try {
    responseJson =
      await response.json();
  } catch {
    responseJson =
      null;
  }

  if (
    !response.ok
  ) {
    console.error(
      "[sendMagicTouchTestPush] Expo rejected push request",
      {
        uid:
          authUid,

        status:
          response.status,

        response:
          responseJson,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      "Expo Push service rejected the request"
    );
  }

  const tickets =
    Array.isArray(
      responseJson?.data
    )
      ? responseJson.data
      : [];

  console.log(
    "[sendMagicTouchTestPush] Push submitted",
    {
      uid:
        authUid,

      tokenCount:
        tokens.length,

      tickets,
    }
  );

  return {
    ok:
      true,

    deviceCount:
      tokens.length,

    tickets,
  };
}