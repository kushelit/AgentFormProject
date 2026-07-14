/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";

import { adminDb, nowTs } from "./admin";
import { PORTAL_ENC_KEY_B64 } from "./secrets";
import {
  decryptJsonAes256Gcm,
  encryptJsonAes256Gcm,
} from "./cryptoAesGcm";
import {
  listMicrosoftBookingCalendarView,
  refreshMicrosoftAccessToken,
} from "./microsoftGraph";

function s(value: any): string {
  return String(value ?? "").trim();
}

function normalizePhone(phone: string): string {
  const digits = s(phone).replace(/\D/g, "");

  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.length === 9) return `972${digits}`;

  return digits;
}

function normalizeEmail(email: string): string {
  return s(email).toLowerCase();
}

function appointmentDocumentId(appointmentId: string): string {
  return createHash("sha256")
    .update(appointmentId)
    .digest("hex");
}

function getAppointmentCustomer(appointment: any): {
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

    email: normalizeEmail(
      customer?.emailAddress ||
      appointment?.customerEmailAddress
    ),

    phone: normalizePhone(
      customer?.phone ||
      appointment?.customerPhone
    ),
  };
}

async function findMatchingLead(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  customerPhone: string,
  customerEmail: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const leadsCollection = db.collection(
    `agents/${agentId}/reengagement_leads`
  );

  if (customerPhone) {
    const phoneSnap = await leadsCollection
      .where("phoneNormalized", "==", customerPhone)
      .limit(1)
      .get();

    if (!phoneSnap.empty) {
      return phoneSnap.docs[0];
    }
  }

  if (customerEmail) {
    const normalizedEmailSnap = await leadsCollection
      .where("emailNormalized", "==", customerEmail)
      .limit(1)
      .get();

    if (!normalizedEmailSnap.empty) {
      return normalizedEmailSnap.docs[0];
    }

    const emailSnap = await leadsCollection
      .where("email", "==", customerEmail)
      .limit(1)
      .get();

    if (!emailSnap.empty) {
      return emailSnap.docs[0];
    }
  }

  return null;
}

export type MicrosoftBookingsSyncResult = {
  appointments: number;
  matched: number;
  unmatched: number;
  cancelled: number;
};

export async function syncMicrosoftBookingsAgent(
  agentId: string
): Promise<MicrosoftBookingsSyncResult> {
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
  const bookingBusinessId = s(config?.bookingBusinessId);

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

  const accessTokenExpiresAtMs =
    Date.now() +
    Number(refreshed.expires_in || 3600) * 1000;

  const encryptedTokens = encryptJsonAes256Gcm(
    keyB64,
    {
      ...decrypted,
      accessToken,
      refreshToken: nextRefreshToken,
      accessTokenExpiresAtMs,
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
    { merge: true }
  );

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

  let matched = 0;
  let unmatched = 0;
  let cancelled = 0;

  for (const appointment of appointments) {
    const appointmentId = s(appointment?.id);

    if (!appointmentId) {
      continue;
    }

    const customer = getAppointmentCustomer(appointment);
    const isCancelled = appointment?.isCancelled === true;

    if (isCancelled) {
      cancelled++;
    }

    const leadDoc = await findMatchingLead(
      db,
      normalizedAgentId,
      customer.phone,
      customer.email
    );

    const appointmentRef = (db as any).doc(
      `agents/${normalizedAgentId}/booking_appointments/${appointmentDocumentId(
        appointmentId
      )}`
    );

    const existingAppointmentSnap =
      await appointmentRef.get();

    await appointmentRef.set(
      {
        appointmentId,
        bookingBusinessId,

        customerName: customer.name || null,
        customerEmail: customer.email || null,
        customerPhone: customer.phone || null,

        serviceId: s(appointment?.serviceId) || null,
        serviceName: s(appointment?.serviceName) || null,

        staffMemberIds:
          Array.isArray(appointment?.staffMemberIds)
            ? appointment.staffMemberIds
            : [],

        startAt: appointment?.start || null,
        endAt: appointment?.end || null,

        isCancelled,

        matchStatus: leadDoc ? "matched" : "unmatched",
        leadId: leadDoc?.id || null,

        rawJson: JSON.stringify(appointment),

        lastSeenAt: nowTs(),
        updatedAt: nowTs(),

        ...(existingAppointmentSnap.exists
          ? {}
          : {
              firstSeenAt: nowTs(),
              createdAt: nowTs(),
            }),
      },
      { merge: true }
    );

    if (!leadDoc) {
      unmatched++;
      continue;
    }

    matched++;

    await leadDoc.ref.update({
      status: isCancelled ? "interested" : "booked",
      interestStatus: "interested",
      bookingStatus: isCancelled ? "cancelled" : "booked",

      bookingAppointmentId: appointmentId,

      bookingCustomerName: customer.name || null,
      bookingCustomerEmail: customer.email || null,
      bookingCustomerPhone: customer.phone || null,

      bookingServiceId: s(appointment?.serviceId) || null,
      bookingServiceName: s(appointment?.serviceName) || null,

      bookingStartAt: appointment?.start || null,
      bookingEndAt: appointment?.end || null,

      bookingCancelledAt: isCancelled ? nowTs() : null,
      bookedAt: isCancelled ? null : nowTs(),
      resolvedAt: isCancelled ? null : nowTs(),

      updatedAt: nowTs(),
    });
  }

  const result: MicrosoftBookingsSyncResult = {
    appointments: appointments.length,
    matched,
    unmatched,
    cancelled,
  };

  await configRef.set(
    {
      status: "connected",
      connected: true,

      lastSyncAt: nowTs(),
      lastSyncStatus: "success",
      lastSyncError: null,

      lastSyncAppointmentCount: result.appointments,
      lastSyncMatchedCount: result.matched,
      lastSyncUnmatchedCount: result.unmatched,
      lastSyncCancelledCount: result.cancelled,

      updatedAt: nowTs(),
    },
    { merge: true }
  );

  return result;
}