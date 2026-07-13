/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";
import { logger } from "firebase-functions";

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

function s(value: any): string {
  return String(value ?? "").trim();
}

function normalizePhone(phone: string): string {
  const digits = s(phone).replace(/\D/g, "");

  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  if (digits.length === 9) return "972" + digits;

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

    email:
      normalizeEmail(
        customer?.emailAddress ||
        appointment?.customerEmailAddress
      ),

    phone:
      normalizePhone(
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

async function syncAgent(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  bookingBusinessId: string
): Promise<{
  appointments: number;
  matched: number;
  unmatched: number;
}> {
  const configRef = db.doc(
    `agents/${agentId}/config/microsoftBookings`
  );

  const secretRef = db.doc(
    `agents/${agentId}/secrets/microsoftBookings`
  );

  const secretSnap = await secretRef.get();

  if (!secretSnap.exists) {
    throw new Error(
      `Microsoft Bookings secret is missing for agent ${agentId}`
    );
  }

  const keyB64 = s(PORTAL_ENC_KEY_B64.value());

  if (!keyB64) {
    throw new Error("Missing encryption key");
  }

  const decrypted = decryptJsonAes256Gcm(
    keyB64,
    secretSnap.data()?.enc
  ) as any;

  const refreshToken = s(decrypted?.refreshToken);

  if (!refreshToken) {
    throw new Error(
      `Microsoft refresh token is missing for agent ${agentId}`
    );
  }

  const refreshed =
    await refreshMicrosoftAccessToken(refreshToken);

  const accessToken = s(refreshed.access_token);
  const nextRefreshToken =
    s(refreshed.refresh_token) || refreshToken;

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

  for (const appointment of appointments) {
    const appointmentId = s(appointment?.id);

    if (!appointmentId) {
      continue;
    }

    const customer =
      getAppointmentCustomer(appointment);

    const leadDoc =
      await findMatchingLead(
        db,
        agentId,
        customer.phone,
        customer.email
      );

    const isCancelled =
      appointment?.isCancelled === true;

    const appointmentRef = db.doc(
      `agents/${agentId}/booking_appointments/${appointmentDocumentId(
        appointmentId
      )}`
    );

    const existingAppointmentSnap =
      await appointmentRef.get();

    const appointmentData = {
      appointmentId,
      bookingBusinessId,

      customerName:
        customer.name || null,

      customerEmail:
        customer.email || null,

      customerPhone:
        customer.phone || null,

      serviceId:
        s(appointment?.serviceId) || null,

      serviceName:
        s(appointment?.serviceName) || null,

      staffMemberIds:
        Array.isArray(appointment?.staffMemberIds)
          ? appointment.staffMemberIds
          : [],

      startAt:
        appointment?.start || null,

      endAt:
        appointment?.end || null,

      isCancelled,

      matchStatus:
        leadDoc ? "matched" : "unmatched",

      leadId:
        leadDoc?.id || null,

      rawJson:
        JSON.stringify(appointment),

      lastSeenAt:
        nowTs(),

      updatedAt:
        nowTs(),
    };

    await appointmentRef.set(
      {
        ...appointmentData,
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
      status:
        isCancelled ? "interested" : "booked",

      interestStatus:
        "interested",

      bookingStatus:
        isCancelled ? "cancelled" : "booked",

      bookingAppointmentId:
        appointmentId,

      bookingCustomerName:
        customer.name || null,

      bookingCustomerEmail:
        customer.email || null,

      bookingCustomerPhone:
        customer.phone || null,

      bookingServiceId:
        s(appointment?.serviceId) || null,

      bookingServiceName:
        s(appointment?.serviceName) || null,

      bookingStartAt:
        appointment?.start || null,

      bookingEndAt:
        appointment?.end || null,

      bookingCancelledAt:
        isCancelled ? nowTs() : null,

      bookedAt:
        isCancelled ? null : nowTs(),

      resolvedAt:
        isCancelled ? null : nowTs(),

      updatedAt:
        nowTs(),
    });
  }

  await configRef.set(
    {
      lastSyncAt: nowTs(),
      lastSyncStatus: "success",
      lastSyncError: null,
      lastSyncAppointmentCount:
        appointments.length,
      updatedAt: nowTs(),
    },
    { merge: true }
  );

  return {
    appointments: appointments.length,
    matched,
    unmatched,
  };
}

export async function syncMicrosoftBookingsAppointmentsImpl():
Promise<void> {
  const db = adminDb();

  const connectionsSnap = await db
    .collection("microsoft_bookings_connections")
    .where("connected", "==", true)
    .get();

  logger.info(
    "[syncMicrosoftBookingsAppointments] sync started",
    {
      connectionCount: connectionsSnap.size,
    }
  );

  for (const connectionDoc of connectionsSnap.docs) {
    const connection = connectionDoc.data() as any;

    const agentId =
      s(connection?.agentId) ||
      connectionDoc.id;

    const bookingBusinessId =
      s(connection?.bookingBusinessId);

    if (!agentId || !bookingBusinessId) {
      continue;
    }

    try {
      const result = await syncAgent(
        db,
        agentId,
        bookingBusinessId
      );

      logger.info(
        "[syncMicrosoftBookingsAppointments] agent synced",
        {
          agentId,
          bookingBusinessId,
          ...result,
        }
      );
    } catch (error: any) {
      logger.error(
        "[syncMicrosoftBookingsAppointments] agent sync failed",
        {
          agentId,
          bookingBusinessId,
          error:
            error?.message ||
            String(error),
        }
      );

      await db
        .doc(
          `agents/${agentId}/config/microsoftBookings`
        )
        .set(
          {
            lastSyncAt: nowTs(),
            lastSyncStatus: "failed",
            lastSyncError:
              error?.message ||
              String(error),
            updatedAt: nowTs(),
          },
          { merge: true }
        );
    }
  }
}