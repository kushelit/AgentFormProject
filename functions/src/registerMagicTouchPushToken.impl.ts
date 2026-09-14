/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createHash,
} from "node:crypto";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

function safeString(
  value: unknown
): string {
  return String(
    value ??
    ""
  ).trim();
}

function tokenDocumentId(
  token: string
): string {
  return createHash(
    "sha256"
  )
    .update(
      token
    )
    .digest(
      "hex"
    );
}

function isValidExpoPushToken(
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

export async function registerMagicTouchPushTokenImpl(
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

  const expoPushToken =
    safeString(
      req.data?.expoPushToken
    );

  const platform =
    safeString(
      req.data?.platform
    ).toLowerCase();

  const deviceName =
    safeString(
      req.data?.deviceName
    );

  const appVersion =
    safeString(
      req.data?.appVersion
    );

  const appEnv =
    safeString(
      req.data?.appEnv
    );

  const active =
    req.data?.active !==
    false;

  if (
    !expoPushToken
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing expoPushToken"
    );
  }

  if (
    !isValidExpoPushToken(
      expoPushToken
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid Expo push token"
    );
  }

  if (
    ![
      "android",
      "ios",
    ].includes(
      platform
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid platform"
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

  if (
    userData?.isActive ===
    false
  ) {
    throw new HttpsError(
      "permission-denied",
      "User is inactive"
    );
  }

  const isSystem =
    userData?.isSystem ===
    true;

  const agentId =
    safeString(
      userData?.agentId
    ) ||
    (
      isSystem
        ? authUid
        : ""
    );

  if (
    !agentId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "User has no agentId"
    );
  }

  const tokenId =
    tokenDocumentId(
      expoPushToken
    );

  const tokenRef =
    userRef
      .collection(
        "magic_touch_push_devices"
      )
      .doc(
        tokenId
      );

  const existingSnap =
    await tokenRef.get();

  const payload:
    Record<string, any> = {
      uid:
        authUid,

      agentId,

      expoPushToken,

      platform,

      deviceName:
        deviceName ||
        null,

      appVersion:
        appVersion ||
        null,

      appEnv:
        appEnv ||
        null,

      active,

      updatedAt:
        nowTs(),

      lastRegisteredAt:
        nowTs(),
    };

  if (
    !existingSnap.exists
  ) {
    payload.createdAt =
      nowTs();
  }

  if (
    active
  ) {
    payload.disabledAt =
      null;
  } else {
    payload.disabledAt =
      nowTs();
  }

  await tokenRef.set(
    payload,
    {
      merge:
        true,
    }
  );

  return {
    ok:
      true,

    tokenId,

    uid:
      authUid,

    agentId,

    platform,

    active,
  };
}