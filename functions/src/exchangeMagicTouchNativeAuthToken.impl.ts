/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getAuth,
} from "firebase-admin/auth";

import {
  HttpsError,
} from "firebase-functions/v2/https";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function exchangeMagicTouchNativeAuthTokenImpl(
  req: any
): Promise<object> {
  const idToken =
    s(
      req.data
        ?.idToken
    );

  if (
    !idToken
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Firebase ID token."
    );
  }

  try {
    /*
     * מאמתים שה-ID token תקין ושייך
     * לפרויקט Firebase הנוכחי.
     */
    const decodedToken =
      await getAuth()
        .verifyIdToken(
          idToken,
          true
        );

    const uid =
      s(
        decodedToken.uid
      );

    if (
      !uid
    ) {
      throw new HttpsError(
        "unauthenticated",
        "The Firebase token does not contain a valid uid."
      );
    }

    /*
     * מוודאים שהמשתמש עדיין קיים
     * ואינו חסום ב-Firebase Authentication.
     */
    const userRecord =
      await getAuth()
        .getUser(
          uid
        );

    if (
      userRecord.disabled
    ) {
      throw new HttpsError(
        "permission-denied",
        "The Firebase user is disabled."
      );
    }

    /*
     * יוצרים Custom Token לאותו UID.
     *
     * המובייל ישתמש בו כדי להתחבר
     * לשכבת Firebase JS הקיימת.
     */
    const customToken =
      await getAuth()
        .createCustomToken(
          uid
        );

    return {
      ok:
        true,

      uid,

      customToken,
    };
  } catch (
    error: any
  ) {
    if (
      error instanceof
      HttpsError
    ) {
      throw error;
    }

    console.error(
      "[exchangeMagicTouchNativeAuthToken] Failed",
      {
        code:
          error?.code,

        message:
          error?.message,
      }
    );

    const code =
      s(
        error?.code
      );

    if (
      code.includes(
        "id-token-expired"
      ) ||
      code.includes(
        "id-token-revoked"
      ) ||
      code.includes(
        "invalid-id-token"
      ) ||
      code.includes(
        "argument-error"
      )
    ) {
      throw new HttpsError(
        "unauthenticated",
        "The Firebase ID token is invalid or expired."
      );
    }

    if (
      code.includes(
        "user-not-found"
      )
    ) {
      throw new HttpsError(
        "not-found",
        "The Firebase user no longer exists."
      );
    }

    throw new HttpsError(
      "internal",
      "Failed to exchange Firebase authentication token."
    );
  }
}