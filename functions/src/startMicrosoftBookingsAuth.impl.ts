/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createHash,
  randomBytes,
} from "node:crypto";

import { HttpsError } from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  MICROSOFT_CLIENT_ID,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import { FUNCTIONS_REGION } from "./shared/region";

import {
  encryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

const MICROSOFT_AUTHORIZE_URL =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";

const OAUTH_STATE_TTL_MS =
  10 * 60 * 1000;

function s(value: any): string {
  return String(value ?? "").trim();
}

function getFirebaseProjectId(): string {
  const directProjectId =
    s(process.env.GCLOUD_PROJECT) ||
    s(process.env.GCP_PROJECT);

  if (directProjectId) {
    return directProjectId;
  }

  const firebaseConfig =
    s(process.env.FIREBASE_CONFIG);

  if (firebaseConfig) {
    try {
      const parsed = JSON.parse(
        firebaseConfig
      );

      const projectId = s(
        parsed?.projectId
      );

      if (projectId) {
        return projectId;
      }
    } catch (error) {
      console.warn(
        "[startMicrosoftBookingsAuth] Could not parse FIREBASE_CONFIG",
        error
      );
    }
  }

  throw new HttpsError(
    "internal",
    "Could not resolve Firebase project ID"
  );
}

function getMicrosoftRedirectUri(): string {
  const projectId =
    getFirebaseProjectId();

  if (!FUNCTIONS_REGION) {
    throw new HttpsError(
      "internal",
      "Missing FUNCTIONS_REGION"
    );
  }

  return (
    `https://${FUNCTIONS_REGION}-${projectId}` +
    ".cloudfunctions.net/" +
    "microsoftBookingsOAuthCallback"
  );
}

function createRandomBase64Url(
  byteLength: number
): string {
  return randomBytes(byteLength)
    .toString("base64url");
}

function createPkceChallenge(
  codeVerifier: string
): string {
  return createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
}

export async function startMicrosoftBookingsAuthImpl(
  agentId: string
): Promise<object> {
  const normalizedAgentId =
    s(agentId);

  if (!normalizedAgentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const clientId =
    s(MICROSOFT_CLIENT_ID.value());

  if (!clientId) {
    throw new HttpsError(
      "internal",
      "Missing Microsoft client ID"
    );
  }

  const encryptionKey =
    s(PORTAL_ENC_KEY_B64.value());

  if (!encryptionKey) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const db = adminDb();

  const redirectUri =
    getMicrosoftRedirectUri();

  /*
   * state מגן על תהליך ה-OAuth ומקשר את החזרה
   * לניסיון ההתחברות שהתחיל ב-MagicSale.
   */
  const state =
    createRandomBase64Url(32);

  /*
   * PKCE:
   * codeVerifier נשמר אצלנו בלבד.
   * ל-Microsoft נשלח רק codeChallenge.
   */
  const codeVerifier =
    createRandomBase64Url(64);

  const codeChallenge =
    createPkceChallenge(
      codeVerifier
    );

  const createdAtMs =
    Date.now();

  const expiresAtMs =
    createdAtMs + OAUTH_STATE_TTL_MS;

  /*
   * שומרים את המידע הרגיש מוצפן.
   * ב-Callback נפענח את agentId,
   * codeVerifier ו-redirectUri.
   */
  const encryptedState =
    encryptJsonAes256Gcm(
      encryptionKey,
      {
        agentId:
          normalizedAgentId,

        codeVerifier,

        redirectUri,

        createdAtMs,
      }
    );

  /*
   * המסמך זמני וחד-פעמי.
   *
   * חשוב: הגישה ל-collection הזאת צריכה להיות
   * דרך Admin SDK בלבד ולא דרך ה-Frontend.
   */
  const stateRef = (db as any).doc(
    `microsoft_oauth_states/${state}`
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
   * אלו ה-scopes שנדרשים כרגע ל:
   * - זיהוי המשתמש
   * - Refresh Token
   * - קריאת Microsoft Bookings
   */
  const scopes = [
    "openid",
    "profile",
    "offline_access",
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Bookings.Read.All",
  ];

  const authUrl =
    new URL(
      MICROSOFT_AUTHORIZE_URL
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
    "response_mode",
    "query"
  );

  authUrl.searchParams.set(
    "scope",
    scopes.join(" ")
  );

  authUrl.searchParams.set(
    "state",
    state
  );

  authUrl.searchParams.set(
    "code_challenge",
    codeChallenge
  );

  authUrl.searchParams.set(
    "code_challenge_method",
    "S256"
  );

  /*
   * מאפשר לבחור חשבון כאשר המשתמש כבר מחובר
   * ליותר מחשבון Microsoft אחד.
   */
  authUrl.searchParams.set(
    "prompt",
    "select_account"
  );

  console.info(
    "[startMicrosoftBookingsAuth] OAuth connection started",
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