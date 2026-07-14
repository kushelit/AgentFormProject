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
  refreshMicrosoftAccessToken,
} from "./shared/microsoftGraph";

function s(value: any): string {
  return String(value ?? "").trim();
}

export async function selectMicrosoftBookingsBusinessImpl(
  agentId: string,
  businessId: string
): Promise<object> {
  const normalizedAgentId = s(agentId);
  const normalizedBusinessId = s(businessId);

  if (!normalizedAgentId || !normalizedBusinessId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId or businessId"
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
      "Microsoft Bookings is not connected"
    );
  }

  const config = configSnap.data() as any;

  const availableBusinesses =
    Array.isArray(config?.availableBusinesses)
      ? config.availableBusinesses
      : [];

  const isAllowed = availableBusinesses.some(
    (business: any) =>
      s(business?.id) === normalizedBusinessId
  );

  if (!isAllowed) {
    throw new HttpsError(
      "permission-denied",
      "The selected Bookings business is not available to this connection"
    );
  }

  const keyB64 = s(PORTAL_ENC_KEY_B64.value());

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

  const refreshToken = s(decrypted?.refreshToken);

  if (!refreshToken) {
    throw new HttpsError(
      "failed-precondition",
      "Missing Microsoft refresh token"
    );
  }

  const refreshed =
    await refreshMicrosoftAccessToken(refreshToken);

  const accessToken = s(refreshed.access_token);
  const nextRefreshToken =
    s(refreshed.refresh_token) || refreshToken;

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft did not return an access token"
    );
  }

  const business =
    await getMicrosoftBookingBusiness(
      accessToken,
      normalizedBusinessId
    );

  const encryptedTokens = encryptJsonAes256Gcm(
    keyB64,
    {
      ...decrypted,
      accessToken,
      refreshToken: nextRefreshToken,
      accessTokenExpiresAtMs:
        Date.now() +
        Number(refreshed.expires_in || 3600) * 1000,
      tokenType: s(refreshed.token_type),
      scope: s(refreshed.scope),
      updatedAtMs: Date.now(),
    }
  );

  await Promise.all([
    secretRef.set(
      {
        enc: encryptedTokens,
        updatedAt: nowTs(),
      },
      { merge: true }
    ),

    configRef.set(
      {
        status: "connected",
        connected: true,

        bookingBusinessId:
          s(business?.id) || normalizedBusinessId,

        bookingBusinessName:
          s(business?.displayName) || null,

        bookingBusinessEmail:
          s(business?.email) || null,

        bookingBusinessPhone:
          s(business?.phone) || null,

        bookingBusinessPublicUrl:
          s(business?.publicUrl) || null,

        selectedAt: nowTs(),
        updatedAt: nowTs(),
      },
      { merge: true }
    ),

    (db as any)
      .doc(
        `microsoft_bookings_connections/${normalizedAgentId}`
      )
      .set(
        {
          agentId: normalizedAgentId,
          status: "connected",
          connected: true,
          bookingBusinessId:
            s(business?.id) || normalizedBusinessId,
          updatedAt: nowTs(),
        },
        { merge: true }
      ),
  ]);

  return {
    ok: true,
    bookingBusinessId:
      s(business?.id) || normalizedBusinessId,
    bookingBusinessName:
      s(business?.displayName) || null,
  };
}