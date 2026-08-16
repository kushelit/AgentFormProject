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

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  decryptJsonAes256Gcm,
  encryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

import {
  getMicrosoftBookingAppointmentDiagnostic,
  listMicrosoftBookingAppointments,
  listMicrosoftBookingCalendarView,
  refreshMicrosoftAccessToken,
} from "./shared/microsoftGraph";

import {
  assertMagicTouchJobsAdmin,
} from "./shared/magicTouchJobs/jobPermissions";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function appointmentDocumentId(
  appointmentId: string
): string {
  return createHash(
    "sha256"
  )
    .update(
      appointmentId
    )
    .digest(
      "hex"
    );
}

function getDateTimeValue(
  value: any
): Date | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return value;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  const rawValue =
    value?.dateTime ??
    value;

  const parsed =
    new Date(
      rawValue
    );

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
}

function summarizeAppointment(
  appointment: any
): any {
  if (!appointment) {
    return null;
  }

  const customer =
    Array.isArray(
      appointment?.customers
    ) &&
    appointment.customers.length >
      0
      ? appointment.customers[0]
      : null;

  return {
    keys:
      Object.keys(
        appointment
      ),

    id:
      s(
        appointment?.id
      ) ||
      null,

    selfServiceAppointmentId:
      s(
        appointment
          ?.selfServiceAppointmentId
      ) ||
      null,

    isCancelled:
      typeof appointment
        ?.isCancelled ===
      "boolean"
        ? appointment
          .isCancelled
        : null,

    isCustomerAllowedToManageBooking:
      typeof appointment
        ?.isCustomerAllowedToManageBooking ===
      "boolean"
        ? appointment
          .isCustomerAllowedToManageBooking
        : null,

    createdDateTime:
      appointment
        ?.createdDateTime ??
      null,

    lastUpdatedDateTime:
      appointment
        ?.lastUpdatedDateTime ??
      null,

    start:
      appointment?.start ??
      appointment
        ?.startDateTime ??
      null,

    end:
      appointment?.end ??
      appointment
        ?.endDateTime ??
      null,

    serviceId:
      s(
        appointment
          ?.serviceId
      ) ||
      null,

    serviceName:
      s(
        appointment
          ?.serviceName
      ) ||
      null,

    customerName:
      s(
        customer?.name ||
        appointment
          ?.customerName
      ) ||
      null,

    customerEmail:
      s(
        customer
          ?.emailAddress ||
        appointment
          ?.customerEmailAddress
      ) ||
      null,

    customerPhone:
      s(
        customer?.phone ||
        appointment
          ?.customerPhone
      ) ||
      null,
  };
}

function findAppointmentById(
  appointments: any[],
  appointmentId: string
): any | null {
  return (
    appointments.find(
      (
        appointment:
          any
      ) =>
        s(
          appointment?.id
        ) ===
        appointmentId
    ) ||
    null
  );
}

export async function diagnoseMicrosoftBookingAppointmentImpl(
  input: {
    uid: string | null;
    agentId: unknown;
    appointmentId: unknown;
  }
): Promise<object> {
  await assertMagicTouchJobsAdmin(
    input.uid
  );

  const normalizedAgentId =
    s(
      input.agentId
    );

  const normalizedAppointmentId =
    s(
      input.appointmentId
    );

  if (
    !normalizedAgentId ||
    !normalizedAppointmentId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId or appointmentId"
    );
  }

  const db =
    adminDb();

  const configRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/config/microsoftBookings`
    );

  const secretRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/secrets/microsoftBookings`
    );

  const storedAppointmentRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/booking_appointments/${appointmentDocumentId(
        normalizedAppointmentId
      )}`
    );

  const [
    configSnap,
    secretSnap,
    storedAppointmentSnap,
  ] =
    await Promise.all([
      configRef.get(),
      secretRef.get(),
      storedAppointmentRef.get(),
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
      config
        ?.bookingBusinessId
    );

  if (!bookingBusinessId) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft Bookings business is not selected"
    );
  }

  const encryptionKey =
    s(
      PORTAL_ENC_KEY_B64
        .value()
    );

  if (!encryptionKey) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const decrypted =
    decryptJsonAes256Gcm(
      encryptionKey,
      secretSnap
        .data()
        ?.enc
    ) as any;

  const refreshToken =
    s(
      decrypted
        ?.refreshToken
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
      refreshed
        .access_token
    );

  const nextRefreshToken =
    s(
      refreshed
        .refresh_token
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
      encryptionKey,
      {
        ...decrypted,

        accessToken,

        refreshToken:
          nextRefreshToken,

        accessTokenExpiresAtMs:
          Date.now() +
          Number(
            refreshed
              .expires_in ||
            3600
          ) *
          1000,

        tokenType:
          s(
            refreshed
              .token_type
          ),

        scope:
          s(
            refreshed
              .scope
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

  const storedAppointment =
    storedAppointmentSnap.exists
      ? storedAppointmentSnap
        .data()
      : null;

  const storedStart =
    getDateTimeValue(
      storedAppointment
        ?.startAt
    );

  const calendarStart =
    storedStart
      ? new Date(
        storedStart
          .getTime() -
        7 *
        24 *
        60 *
        60 *
        1000
      )
      : new Date(
        Date.now() -
        30 *
        24 *
        60 *
        60 *
        1000
      );

  const calendarEnd =
    storedStart
      ? new Date(
        storedStart
          .getTime() +
        7 *
        24 *
        60 *
        60 *
        1000
      )
      : new Date(
        Date.now() +
        180 *
        24 *
        60 *
        60 *
        1000
      );

  const [
    calendarAppointments,
    allAppointments,
    directLookup,
  ] =
    await Promise.all([
      listMicrosoftBookingCalendarView(
        accessToken,
        bookingBusinessId,
        calendarStart
          .toISOString(),
        calendarEnd
          .toISOString()
      ),

      listMicrosoftBookingAppointments(
        accessToken,
        bookingBusinessId
      ),

      getMicrosoftBookingAppointmentDiagnostic(
        accessToken,
        bookingBusinessId,
        normalizedAppointmentId
      ),
    ]);

  const calendarAppointment =
    findAppointmentById(
      calendarAppointments,
      normalizedAppointmentId
    );

  const listAppointment =
    findAppointmentById(
      allAppointments,
      normalizedAppointmentId
    );

  const result = {
    ok: true,

    agentId:
      normalizedAgentId,

    bookingBusinessId,

    appointmentId:
      normalizedAppointmentId,

    checkedAt:
      new Date()
        .toISOString(),

    storedAppointment: {
      found:
        storedAppointmentSnap
          .exists,

      data:
        storedAppointment
          ? {
            appointmentId:
              s(
                storedAppointment
                  ?.appointmentId
              ) ||
              null,

            isCancelled:
              typeof storedAppointment
                ?.isCancelled ===
              "boolean"
                ? storedAppointment
                  .isCancelled
                : null,

            startAt:
              storedAppointment
                ?.startAt ??
              null,

            endAt:
              storedAppointment
                ?.endAt ??
              null,

            lastSeenAt:
              storedAppointment
                ?.lastSeenAt ??
              null,

            lastEventType:
              s(
                storedAppointment
                  ?.lastEventType
              ) ||
              null,
          }
          : null,
    },

    calendarView: {
      start:
        calendarStart
          .toISOString(),

      end:
        calendarEnd
          .toISOString(),

      count:
        calendarAppointments
          .length,

      found:
        Boolean(
          calendarAppointment
        ),

      appointment:
        summarizeAppointment(
          calendarAppointment
        ),
    },

    appointmentsList: {
      count:
        allAppointments
          .length,

      found:
        Boolean(
          listAppointment
        ),

      appointment:
        summarizeAppointment(
          listAppointment
        ),
    },

    directLookup: {
      found:
        directLookup
          .found,

      status:
        directLookup
          .status,

      appointment:
        summarizeAppointment(
          directLookup
            .data
        ),

      error:
        directLookup
          .error,
    },
  };

  console.info(
    "[diagnoseMicrosoftBookingAppointment]",
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}