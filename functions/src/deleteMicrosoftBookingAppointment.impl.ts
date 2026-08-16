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
  deleteMicrosoftBookingAppointment,
  refreshMicrosoftAccessToken,
} from "./shared/microsoftGraph";

import {
  assertMagicTouchJobsAdmin,
} from "./shared/magicTouchJobs/jobPermissions";

const REQUIRED_CONFIRMATION =
  "DELETE";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function deleteMicrosoftBookingAppointmentImpl(
  input: {
    uid: string | null;
    agentId: unknown;
    appointmentId: unknown;
    confirmation: unknown;
  }
): Promise<Record<string, unknown>> {
 await assertMagicTouchJobsAdmin(
  input.uid
);

  const agentId =
    s(input.agentId);

  const appointmentId =
    s(input.appointmentId);

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (!appointmentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing appointmentId"
    );
  }

  if (
    s(input.confirmation) !==
    REQUIRED_CONFIRMATION
  ) {
    throw new HttpsError(
      "failed-precondition",
      `Type ${REQUIRED_CONFIRMATION} to confirm deletion`
    );
  }

  const db =
    adminDb();

  const configRef =
    db.doc(
      `agents/${agentId}/config/microsoftBookings`
    );

  const secretRef =
    db.doc(
      `agents/${agentId}/secrets/microsoftBookings`
    );

  const [
    configSnap,
    secretSnap,
  ] =
    await Promise.all([
      configRef.get(),
      secretRef.get(),
    ]);

  if (!configSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft Bookings config was not found"
    );
  }

  if (!secretSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft Bookings secret was not found"
    );
  }

  const config =
    configSnap.data() as any;

  const bookingBusinessId =
    s(
      config?.bookingBusinessId
    );

  if (!bookingBusinessId) {
    throw new HttpsError(
      "failed-precondition",
      "A Microsoft Bookings business must be selected first"
    );
  }

  const keyB64 =
    s(
      PORTAL_ENC_KEY_B64.value()
    );

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const decrypted =
    decryptJsonAes256Gcm(
      keyB64,
      secretSnap.data()?.enc
    ) as any;

  const refreshToken =
    s(
      decrypted?.refreshToken
    );

  if (!refreshToken) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft refresh token is missing"
    );
  }

  const refreshed =
    await refreshMicrosoftAccessToken(
      refreshToken
    );

  const accessToken =
    s(
      refreshed.access_token
    );

  const nextRefreshToken =
    s(
      refreshed.refresh_token
    ) ||
    refreshToken;

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft did not return an access token"
    );
  }

  const encryptedTokens =
    encryptJsonAes256Gcm(
      keyB64,
      {
        ...decrypted,
        accessToken,
        refreshToken:
          nextRefreshToken,
        accessTokenExpiresAtMs:
          Date.now() +
          Number(
            refreshed.expires_in ||
            3600
          ) *
          1000,
        tokenType:
          s(
            refreshed.token_type
          ),
        scope:
          s(
            refreshed.scope
          ),
        updatedAtMs:
          Date.now(),
      }
    );

  await secretRef.set(
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
  );

  const result =
    await deleteMicrosoftBookingAppointment({
      accessToken,
      businessId:
        bookingBusinessId,
      appointmentId,
    });

  return {
    ok: true,
    deleted: true,
    agentId,
    bookingBusinessId,
    appointmentId,
    httpStatus:
      result.status,
  };
}
