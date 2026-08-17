/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  decryptJsonAes256Gcm,
  encryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

import {
  listMicrosoftBookingStaffMembers,
  refreshMicrosoftAccessToken,
} from "./shared/microsoftGraph";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function listMicrosoftBookingStaffMembersImpl(
  input: {
    uid: string | null;
  }
): Promise<Record<string, unknown>> {
  const agentId =
    s(
      input.uid
    );

  if (!agentId) {
    throw new HttpsError(
      "unauthenticated",
      "A signed-in user is required"
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

  if (
    !configSnap.exists ||
    !secretSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft Bookings is not connected"
    );
  }

  const config =
    configSnap.data() as any;

  if (
    config?.connected !==
    true
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft Bookings is not connected"
    );
  }

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

  const staff =
    await listMicrosoftBookingStaffMembers(
      accessToken,
      bookingBusinessId
    );

  const normalizedStaff =
    staff.map(
      (
        member
      ) => ({
        id:
          s(
            member.id
          ),

        displayName:
          s(
            member.displayName
          ),

        emailAddress:
          s(
            member.emailAddress
          ) ||
          null,

        role:
          s(
            member.role
          ) ||
          null,

        membershipStatus:
          s(
            member.membershipStatus
          ) ||
          null,

        timeZone:
          s(
            member.timeZone
          ) ||
          null,

        useBusinessHours:
          member.useBusinessHours !==
          false,

        availabilityIsAffectedByPersonalCalendar:
          member.availabilityIsAffectedByPersonalCalendar ===
          true,

        workingHours:
          Array.isArray(
            member.workingHours
          )
            ? member.workingHours
            : [],
      })
    );

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
        availableStaffMembers:
          normalizedStaff,

        staffMembersSyncedAt:
          nowTs(),

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

    agentId,

    bookingBusinessId,

    count:
      normalizedStaff.length,

    staffMembers:
      normalizedStaff,

    selectedStaffMemberId:
      s(
        config?.selectedBookingStaffMemberId
      ) ||
      null,
  };
}