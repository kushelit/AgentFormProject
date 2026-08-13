/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./admin";

import {
  PORTAL_ENC_KEY_B64,
} from "./secrets";

import {
  decryptJsonAes256Gcm,
  encryptJsonAes256Gcm,
  type EncryptOut,
} from "./cryptoAesGcm";

export type SurenseApiCredentials = {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
};

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function getSecretRef(
  agentId: string
) {
  return adminDb().doc(
    `agents/${agentId}/secrets/surenseApi`
  );
}

function normalizeTokenEndpoint(
  value: unknown
): string {
  const raw =
    s(value);

  if (!raw) {
    return "https://auth.surense.com/oauth/token";
  }

  try {
    const url =
      new URL(raw);

    if (
      url.protocol !==
      "https:"
    ) {
      throw new Error(
        "Token endpoint must use HTTPS"
      );
    }

    return url.toString();
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "Invalid Surense token endpoint"
    );
  }
}

export async function saveSurenseApiCredentials(
  input: {
    agentId: string;
    clientId: string;
    clientSecret: string;
    tokenEndpoint?: string;
    updatedBy?: string | null;
  }
): Promise<void> {
  const agentId =
    s(
      input.agentId
    );

  const clientId =
    s(
      input.clientId
    );

  const clientSecret =
    s(
      input.clientSecret
    );

  const tokenEndpoint =
    normalizeTokenEndpoint(
      input.tokenEndpoint
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (!clientId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Surense clientId"
    );
  }

  if (!clientSecret) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Surense clientSecret"
    );
  }

  const keyB64 =
    PORTAL_ENC_KEY_B64.value();

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const payload:
    SurenseApiCredentials = {
      clientId,
      clientSecret,
      tokenEndpoint,
    };

  const enc =
    encryptJsonAes256Gcm(
      keyB64,
      payload
    );

  const timestamp =
    nowTs();

  await getSecretRef(
    agentId
  ).set(
    {
      enc,

      secretType:
        "surense_oauth_credentials",

      authType:
        "oauth2",

      updatedAt:
        timestamp,

      updatedBy:
        s(
          input.updatedBy
        ) ||
        null,
    },
    {
      merge: true,
    }
  );

  /*
   * ב-config נשמר metadata בלבד.
   * לעולם לא נשמרים כאן Client Secret
   * או Client ID מלא.
   */
  await adminDb()
    .doc(
      `agents/${agentId}/config/main`
    )
    .set(
      {
        integrations: {
          surense: {
            directApi: {
              credentialsConfigured:
                true,

              authType:
                "oauth2",

              updatedAt:
                timestamp,

              updatedBy:
                s(
                  input.updatedBy
                ) ||
                null,
            },
          },
        },
      },
      {
        merge: true,
      }
    );
}

export async function loadSurenseApiCredentials(
  agentIdInput: string
): Promise<SurenseApiCredentials> {
  const agentId =
    s(
      agentIdInput
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const snap =
    await getSecretRef(
      agentId
    ).get();

  if (!snap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Surense API credentials are not configured for agent"
    );
  }

  const data =
    snap.data() as any;

  const enc =
    data?.enc as
      | EncryptOut
      | undefined;

  if (
    !enc?.ivB64 ||
    !enc?.tagB64 ||
    !enc?.dataB64
  ) {
    throw new HttpsError(
      "internal",
      "Invalid Surense API secret payload"
    );
  }

  const keyB64 =
    PORTAL_ENC_KEY_B64.value();

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  let plain:
    SurenseApiCredentials;

  try {
    plain =
      decryptJsonAes256Gcm(
        keyB64,
        enc
      ) as SurenseApiCredentials;
  } catch (
    error
  ) {
    console.error(
      "[surenseApiSecret] Failed to decrypt Surense OAuth credentials",
      {
        agentId,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      }
    );

    throw new HttpsError(
      "internal",
      "Failed to decrypt Surense API credentials"
    );
  }

  const clientId =
    s(
      plain?.clientId
    );

  const clientSecret =
    s(
      plain?.clientSecret
    );

  const tokenEndpoint =
    normalizeTokenEndpoint(
      plain?.tokenEndpoint
    );

  if (
    !clientId ||
    !clientSecret
  ) {
    throw new HttpsError(
      "internal",
      "Decrypted Surense API credentials are incomplete"
    );
  }

  return {
    clientId,
    clientSecret,
    tokenEndpoint,
  };
}

export async function hasSurenseApiCredentials(
  agentIdInput: string
): Promise<boolean> {
  const agentId =
    s(
      agentIdInput
    );

  if (!agentId) {
    return false;
  }

  const snap =
    await getSecretRef(
      agentId
    ).get();

  if (!snap.exists) {
    return false;
  }

  const data =
    snap.data() as any;

  return Boolean(
    data?.enc?.ivB64 &&
    data?.enc?.tagB64 &&
    data?.enc?.dataB64
  );
}