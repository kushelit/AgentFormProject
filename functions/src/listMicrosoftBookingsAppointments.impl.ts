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
  listMicrosoftBookingCalendarView,
  refreshMicrosoftAccessToken,
} from "./shared/microsoftGraph";

import {
  assertMagicTouchJobsAdmin,
} from "./shared/magicTouchJobs/jobPermissions";

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePhone(phone: unknown): string {
  const digits = s(phone).replace(/\D/g, "");

  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.length === 9) return `972${digits}`;

  return digits;
}

function getCustomer(appointment: any): {
  name: string;
  email: string;
  phone: string;
} {
  const customer =
    Array.isArray(appointment?.customers) &&
    appointment.customers.length > 0
      ? appointment.customers[0]
      : {};

  return {
    name:
      s(customer?.name) ||
      s(appointment?.customerName),

    email:
      s(
        customer?.emailAddress ||
        appointment?.customerEmailAddress
      ).toLowerCase(),

    phone:
      normalizePhone(
        customer?.phone ||
        appointment?.customerPhone
      ),
  };
}

function getStart(appointment: any): any {
  return (
    appointment?.start ??
    appointment?.startAt ??
    appointment?.startDateTime ??
    null
  );
}

function getEnd(appointment: any): any {
  return (
    appointment?.end ??
    appointment?.endAt ??
    appointment?.endDateTime ??
    null
  );
}

export async function listMicrosoftBookingsAppointmentsImpl(input: {
  uid: string | null;
  agentId: unknown;
}): Promise<Record<string, unknown>> {
await assertMagicTouchJobsAdmin(
  input.uid
);

  const agentId = s(input.agentId);

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const db = adminDb();

  const configRef = db.doc(
    `agents/${agentId}/config/microsoftBookings`
  );

  const secretRef = db.doc(
    `agents/${agentId}/secrets/microsoftBookings`
  );

  const [configSnap, secretSnap] = await Promise.all([
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

  const config = configSnap.data() as any;

  const bookingBusinessId = s(
    config?.bookingBusinessId
  );

  if (!bookingBusinessId) {
    throw new HttpsError(
      "failed-precondition",
      "A Microsoft Bookings business must be selected first"
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
      "Microsoft refresh token is missing"
    );
  }

  const refreshed = await refreshMicrosoftAccessToken(
    refreshToken
  );

  const accessToken = s(refreshed.access_token);
  const nextRefreshToken =
    s(refreshed.refresh_token) || refreshToken;

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft did not return an access token"
    );
  }

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

  await secretRef.set(
    {
      enc: encryptedTokens,
      updatedAt: nowTs(),
    },
    {
      merge: true,
    }
  );

  // Same window used by the real sync:
  // from yesterday through 90 days ahead.
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 1);

  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 90);

  const appointments =
    await listMicrosoftBookingCalendarView(
      accessToken,
      bookingBusinessId,
      start.toISOString(),
      end.toISOString()
    );

  const items = appointments.map(
    (appointment: any) => {
      const customer = getCustomer(appointment);

      return {
        appointmentId: s(appointment?.id),
        selfServiceAppointmentId:
          s(appointment?.selfServiceAppointmentId) ||
          null,
        customerName: customer.name || null,
        customerEmail: customer.email || null,
        customerPhone: customer.phone || null,
        serviceId: s(appointment?.serviceId) || null,
        serviceName: s(appointment?.serviceName) || null,
        startAt: getStart(appointment),
        endAt: getEnd(appointment),
        isCancelled:
          appointment?.isCancelled === true,
        createdDateTime:
          s(appointment?.createdDateTime) || null,
        lastUpdatedDateTime:
          s(appointment?.lastUpdatedDateTime) || null,
      };
    }
  );

  items.sort((a: any, b: any) => {
    const aDate = s(a?.startAt?.dateTime || a?.startAt);
    const bDate = s(b?.startAt?.dateTime || b?.startAt);
    return aDate.localeCompare(bDate);
  });

  return {
    ok: true,
    agentId,
    bookingBusinessId,
    start: start.toISOString(),
    end: end.toISOString(),
    count: items.length,
    appointments: items,
  };
}
