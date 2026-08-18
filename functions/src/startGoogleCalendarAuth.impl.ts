/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  randomBytes,
} from "node:crypto";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  GOOGLE_CLIENT_ID,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  encryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

const GOOGLE_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";

const OAUTH_STATE_TTL_MS =
  10 *
  60 *
  1000;

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function getFirebaseProjectId():
string {
  const directProjectId =
    s(
      process.env
        .GCLOUD_PROJECT
    ) ||
    s(
      process.env
        .GCP_PROJECT
    );

  if (
    directProjectId
  ) {
    return directProjectId;
  }

  const firebaseConfig =
    s(
      process.env
        .FIREBASE_CONFIG
    );

  if (
    firebaseConfig
  ) {
    try {
      const parsed =
        JSON.parse(
          firebaseConfig
        );

      const projectId =
        s(
          parsed
            ?.projectId
        );

      if (
        projectId
      ) {
        return projectId;
      }
    } catch (
      error
    ) {
      console.warn(
        "[startGoogleCalendarAuth] Could not parse FIREBASE_CONFIG",
        error
      );
    }
  }

  throw new HttpsError(
    "internal",
    "Could not resolve Firebase project ID"
  );
}

function getGoogleRedirectUri():
string {
  const projectId =
    getFirebaseProjectId();

  if (
    !FUNCTIONS_REGION
  ) {
    throw new HttpsError(
      "internal",
      "Missing FUNCTIONS_REGION"
    );
  }

  return (
    `https://${FUNCTIONS_REGION}-${projectId}` +
    ".cloudfunctions.net/" +
    "googleCalendarOAuthCallback"
  );
}

function createRandomBase64Url(
  byteLength:
    number
): string {
  return randomBytes(
    byteLength
  ).toString(
    "base64url"
  );
}

export async function startGoogleCalendarAuthImpl(
  agentId:
    string
): Promise<object> {
  const normalizedAgentId =
    s(
      agentId
    );

  if (
    !normalizedAgentId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const clientId =
    s(
      GOOGLE_CLIENT_ID.value()
    );

  if (
    !clientId
  ) {
    throw new HttpsError(
      "internal",
      "Missing Google client ID"
    );
  }

  const encryptionKey =
    s(
      PORTAL_ENC_KEY_B64.value()
    );

  if (
    !encryptionKey
  ) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const db =
    adminDb();

  const redirectUri =
    getGoogleRedirectUri();

  const state =
    createRandomBase64Url(
      32
    );

  const createdAtMs =
    Date.now();

  const expiresAtMs =
    createdAtMs +
    OAUTH_STATE_TTL_MS;

  const encryptedState =
    encryptJsonAes256Gcm(
      encryptionKey,
      {
        agentId:
          normalizedAgentId,

        redirectUri,

        createdAtMs,
      }
    );

  const stateRef =
    (db as any).doc(
      `google_oauth_states/${state}`
    );

  await stateRef.set({
    enc:
      encryptedState,

    used:
      false,

    createdAt:
      nowTs(),

    createdAtMs,

    expiresAtMs,
  });

  /*
   * אלו בדיוק שני ה-scopes
   * שהגדרנו ב-Google Auth Platform.
   */
  const scopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ];

  const authUrl =
    new URL(
      GOOGLE_AUTHORIZE_URL
    );

  authUrl.searchParams.set(
    "client_id",
    clientId
  );

  authUrl.searchParams.set(
    "response_type",
    "code"
  );

  authUrl.searchParams.set(
    "redirect_uri",
    redirectUri
  );

  authUrl.searchParams.set(
    "scope",
    scopes.join(
      " "
    )
  );

  authUrl.searchParams.set(
    "state",
    state
  );

  /*
   * חשוב ל-MagicTouch:
   * אנחנו רוצים להמשיך לסנכרן
   * גם כשהסוכן לא נמצא באתר.
   */
  authUrl.searchParams.set(
    "access_type",
    "offline"
  );

  /*
   * נדרש במיוחד בשלב החיבור שלנו
   * כדי ש-Google יחזיר refresh token
   * גם בתהליכי re-connect.
   */
  authUrl.searchParams.set(
    "prompt",
    "consent select_account"
  );

  authUrl.searchParams.set(
    "include_granted_scopes",
    "true"
  );

  console.info(
    "[startGoogleCalendarAuth] OAuth connection started",
    {
      agentId:
        normalizedAgentId,

      projectId:
        getFirebaseProjectId(),

      region:
        FUNCTIONS_REGION,

      redirectUri,

      expiresAtMs,
    }
  );

  return {
    ok:
      true,

    authUrl:
      authUrl.toString(),

    expiresAtMs,
  };
}