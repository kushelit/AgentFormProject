/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

import { adminDb, nowTs } from "./shared/admin";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";
import {
  decryptJsonAes256Gcm,
  encryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

import {
  getMicrosoftBookingBusiness,
  getMicrosoftMe,
  refreshMicrosoftAccessToken,
} from "./shared/microsoftGraph";

function s(value: any): string {
  return String(value ?? "").trim();
}

export async function testMicrosoftBookingsConnectionImpl(
  agentId: string
): Promise<object> {
  const normalizedAgentId = s(agentId);

  if (!normalizedAgentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const db = adminDb();

  const configRef = (db as any).doc(
    `agents/${normalizedAgentId}/config/microsoftBookings`
  );

  const secretRef = (db as any).doc(
    `agents/${normalizedAgentId}/secrets/microsoftBookings`
  );

  const [configSnap, secretSnap] = await Promise.all([
    configRef.get(),
    secretRef.get(),
  ]);

  if (!configSnap.exists || !secretSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft Bookings is not connected for this agent"
    );
  }

  const config = configSnap.data() as any;
  const bookingBusinessId = s(
    config?.bookingBusinessId
  );

  if (!bookingBusinessId) {
    throw new HttpsError(
      "failed-precondition",
      "Missing Microsoft Bookings business selection"
    );
  }

  const keyB64 = s(
    PORTAL_ENC_KEY_B64.value()
  );

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const decrypted = decryptJsonAes256Gcm(
    keyB64,
    secretSnap.data()?.enc
  ) as any;

  const refreshToken = s(
    decrypted?.refreshToken
  );

  if (!refreshToken) {
    throw new HttpsError(
      "failed-precondition",
      "Missing Microsoft refresh token"
    );
  }

  const refreshed =
    await refreshMicrosoftAccessToken(
      refreshToken
    );

  const accessToken = s(
    refreshed.access_token
  );

  const nextRefreshToken =
    s(refreshed.refresh_token) ||
    refreshToken;

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft did not return an access token"
    );
  }

  const [me, business] = await Promise.all([
    getMicrosoftMe(accessToken),
    getMicrosoftBookingBusiness(
      accessToken,
      bookingBusinessId
    ),
  ]);

  const expiresAtMs =
    Date.now() +
    Number(refreshed.expires_in || 3600) * 1000;

  const encryptedTokens =
    encryptJsonAes256Gcm(
      keyB64,
      {
        ...decrypted,
        accessToken,
        refreshToken:
          nextRefreshToken,
        accessTokenExpiresAtMs:
          expiresAtMs,
        tokenType:
          s(refreshed.token_type),
        scope:
          s(refreshed.scope),
        updatedAtMs:
          Date.now(),
      }
    );

  await Promise.all([
    secretRef.set(
      {
        enc:
          encryptedTokens,
        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    ),

    configRef.set(
      {
        status:
          "connected",
        connected:
          true,

        microsoftUserId:
          s(me?.id) || null,

        microsoftUserName:
          s(me?.displayName) || null,

        microsoftUserEmail:
          s(me?.mail) ||
          s(me?.userPrincipalName) ||
          null,

        bookingBusinessId:
          s(business?.id) || bookingBusinessId,

        bookingBusinessName:
          s(business?.displayName) || null,

        bookingBusinessEmail:
          s(business?.email) || null,

        bookingBusinessPhone:
          s(business?.phone) || null,

        bookingBusinessPublicUrl:
          s(business?.publicUrl) || null,

        lastConnectionTestAt:
          nowTs(),

        lastConnectionTestStatus:
          "success",

        lastConnectionTestError:
          null,

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    ),
  ]);

  return {
    ok:
      true,

    microsoftUserId:
      s(me?.id) || null,

    microsoftUserName:
      s(me?.displayName) || null,

    microsoftUserEmail:
      s(me?.mail) ||
      s(me?.userPrincipalName) ||
      null,

    bookingBusinessId:
      s(business?.id) ||
      bookingBusinessId,

    bookingBusinessName:
      s(business?.displayName) ||
      null,
  };
}