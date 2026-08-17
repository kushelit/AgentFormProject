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
  updateMicrosoftBookingStaffMember,
} from "./shared/microsoftGraph";

import type {
  MicrosoftBookingDayOfWeek,
  MicrosoftBookingWorkHours,
} from "./shared/microsoftGraph";

const VALID_DAYS =
  new Set<
    MicrosoftBookingDayOfWeek
  >([
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]);

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeTime(
  value: unknown
): string {
  const raw =
    s(
      value
    );

  if (
    !/^\d{2}:\d{2}$/.test(
      raw
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid time: ${raw}`
    );
  }

  const [
    hourText,
    minuteText,
  ] =
    raw.split(
      ":"
    );

  const hour =
    Number(
      hourText
    );

  const minute =
    Number(
      minuteText
    );

  if (
    hour <
      0 ||
    hour >
      23 ||
    minute <
      0 ||
    minute >
      59
  ) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid time: ${raw}`
    );
  }

  return `${hourText}:${minuteText}:00.0000000`;
}

function normalizeWorkingHours(
  value: unknown
): MicrosoftBookingWorkHours[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "workingHours must be an array"
    );
  }

  const byDay =
    new Map<
      MicrosoftBookingDayOfWeek,
      MicrosoftBookingWorkHours
    >();

  for (
    const item of
    value
  ) {
    const rawDay =
      s(
        item?.day
      ) as
        MicrosoftBookingDayOfWeek;

    if (
      !VALID_DAYS.has(
        rawDay
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid day: ${rawDay}`
      );
    }

    const enabled =
      item?.enabled ===
      true;

    if (!enabled) {
      byDay.set(
        rawDay,
        {
          day:
            rawDay,

          timeSlots:
            [],
        }
      );

      continue;
    }

    const startTime =
      normalizeTime(
        item?.startTime
      );

    const endTime =
      normalizeTime(
        item?.endTime
      );

    if (
      startTime >=
      endTime
    ) {
      throw new HttpsError(
        "invalid-argument",
        `Start time must be before end time for ${rawDay}`
      );
    }

    byDay.set(
      rawDay,
      {
        day:
          rawDay,

        timeSlots: [
          {
            startTime,
            endTime,
          },
        ],
      }
    );
  }

  /*
   * שולחים תמיד את כל שבעת הימים.
   * יום שלא הופיע בקלט נחשב לא פעיל.
   */
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ].map(
    (
      day
    ) =>
      byDay.get(
        day as
          MicrosoftBookingDayOfWeek
      ) || {
        day:
          day as
            MicrosoftBookingDayOfWeek,

        timeSlots:
          [],
      }
  );
}

export async function updateMicrosoftBookingStaffAvailabilityImpl(
  input: {
    uid: string | null;

    staffMemberId: unknown;

    workingHours: unknown;

    timeZone?: unknown;
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

  const staffMemberId =
    s(
      input.staffMemberId
    );

  if (!staffMemberId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing staffMemberId"
    );
  }

  const timeZone =
    s(
      input.timeZone
    ) ||
    "Israel Standard Time";

  const workingHours =
    normalizeWorkingHours(
      input.workingHours
    );

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

  /*
   * לא סומכים רק על ID שקיבלנו מה-client.
   * מוודאים שהוא באמת Staff של העסק המחובר.
   */
  const staffMembers =
    await listMicrosoftBookingStaffMembers(
      accessToken,
      bookingBusinessId
    );

  const staffMember =
    staffMembers.find(
      (
        member
      ) =>
        s(
          member.id
        ) ===
        staffMemberId
    );

  if (!staffMember) {
    throw new HttpsError(
      "not-found",
      "The selected Microsoft Bookings staff member was not found"
    );
  }

  await updateMicrosoftBookingStaffMember({
    accessToken,

    businessId:
      bookingBusinessId,

    staffMemberId,

    /*
     * מכאן השעות האישיות של הסוכן
     * הן שקובעות את חלונות הזמינות.
     */
    useBusinessHours:
      false,

    /*
     * בתוך חלונות העבודה Microsoft
     * גם יבדוק אם Outlook כבר תפוס.
     */
    availabilityIsAffectedByPersonalCalendar:
      true,

    timeZone,

    workingHours,
  });

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
        selectedBookingStaffMemberId:
          staffMemberId,

        selectedBookingStaffMemberName:
          s(
            staffMember.displayName
          ) ||
          null,

        selectedBookingStaffMemberEmail:
          s(
            staffMember.emailAddress
          ) ||
          null,

        bookingStaffTimeZone:
          timeZone,

        bookingStaffUseBusinessHours:
          false,

        bookingStaffAvailabilityAffectedByPersonalCalendar:
          true,

        bookingStaffWorkingHours:
          workingHours,

        bookingStaffAvailabilityUpdatedAt:
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

    staffMember: {
      id:
        staffMemberId,

      displayName:
        s(
          staffMember.displayName
        ) ||
        null,

      emailAddress:
        s(
          staffMember.emailAddress
        ) ||
        null,
    },

    useBusinessHours:
      false,

    availabilityIsAffectedByPersonalCalendar:
      true,

    timeZone,

    workingHours,
  };
}