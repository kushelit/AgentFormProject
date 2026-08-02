/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  logger,
} from "firebase-functions";

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

function sha256(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function appointmentDocumentId(
  appointmentId: string
): string {
  return sha256(appointmentId);
}

function bookingEventDocumentId(
  agentId: string,
  appointmentId: string,
  triggerType: string
): string {
  return sha256(
    [
      "microsoft_bookings",
      agentId,
      appointmentId,
      triggerType,
    ].join("|")
  );
}

function getAppointmentCustomer(
  appointment: any
): {
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

function getAppointmentStart(
  appointment: any
): any {
  return (
    appointment?.start ??
    appointment?.startDateTime ??
    null
  );
}

function getAppointmentEnd(
  appointment: any
): any {
  return (
    appointment?.end ??
    appointment?.endDateTime ??
    null
  );
}

async function findMatchingContact(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  customerPhone: string,
  customerEmail: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const contactsCollection = db.collection(
    `agents/${agentId}/magic_touch_contacts`
  );

  if (customerPhone) {
    const phoneSnap = await contactsCollection
      .where(
        "phoneNormalized",
        "==",
        customerPhone
      )
      .limit(1)
      .get();

    if (!phoneSnap.empty) {
      return phoneSnap.docs[0];
    }
  }

  if (customerEmail) {
    const normalizedEmailSnap =
      await contactsCollection
        .where(
          "emailNormalized",
          "==",
          customerEmail
        )
        .limit(1)
        .get();

    if (!normalizedEmailSnap.empty) {
      return normalizedEmailSnap.docs[0];
    }

    const emailSnap = await contactsCollection
      .where(
        "email",
        "==",
        customerEmail
      )
      .limit(1)
      .get();

    if (!emailSnap.empty) {
      return emailSnap.docs[0];
    }
  }

  return null;
}

async function createBookingMagicTouchEvent({
  db,
  agentId,
  contactId,
  appointmentId,
  bookingBusinessId,
  appointment,
  customer,
  triggerType,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  contactId: string;
  appointmentId: string;
  bookingBusinessId: string;
  appointment: any;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  triggerType:
    | "microsoft_booking_created"
    | "microsoft_booking_cancelled";
}): Promise<{
  created: boolean;
  eventId: string;
}> {
  const eventId =
    bookingEventDocumentId(
      agentId,
      appointmentId,
      triggerType
    );

  const eventRef = db.doc(
    `agents/${agentId}/magic_touch_events/${eventId}`
  );

  const eventSnap = await eventRef.get();

  if (eventSnap.exists) {
    return {
      created: false,
      eventId,
    };
  }

  const timestamp = nowTs();

  await eventRef.create({
    agentId,
    eventId,

    triggerType,

    channel:
      "microsoft_bookings",

    sourceSystem:
      "microsoft_bookings",

    contactId,

    bookingAppointmentId:
      appointmentId,

    bookingBusinessId,

    bookingServiceId:
      s(appointment?.serviceId) ||
      null,

    bookingServiceName:
      s(appointment?.serviceName) ||
      null,

    bookingStartAt:
      getAppointmentStart(
        appointment
      ),

    bookingEndAt:
      getAppointmentEnd(
        appointment
      ),

    bookingIsCancelled:
      triggerType ===
      "microsoft_booking_cancelled",

    customerName:
      customer.name ||
      null,

    customerEmail:
      customer.email ||
      null,

    customerPhone:
      customer.phone ||
      null,

    occurredAt:
      timestamp,

    status:
      "pending",

    attempts:
      0,

    createdAt:
      timestamp,

    updatedAt:
      timestamp,
  });

  return {
    created: true,
    eventId,
  };
}

export type MicrosoftBookingsSyncResult = {
  appointments: number;
  matched: number;
  unmatched: number;
  cancelled: number;
  createdEvents: number;
  cancelledEvents: number;
};

export async function syncMicrosoftBookingsAgent(
  agentId: string
): Promise<MicrosoftBookingsSyncResult> {
  const normalizedAgentId =
    s(agentId);

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

  const [configSnap, secretSnap] =
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
    s(config?.bookingBusinessId);

  if (!bookingBusinessId) {
    throw new HttpsError(
      "failed-precondition",
      "A Microsoft Bookings business must be selected first"
    );
  }

  const keyB64 =
    s(PORTAL_ENC_KEY_B64.value());

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
    s(decrypted?.refreshToken);

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
    s(refreshed.access_token);

  const nextRefreshToken =
    s(refreshed.refresh_token) ||
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
          s(refreshed.token_type),

        scope:
          s(refreshed.scope),

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

  const start = new Date();
  start.setUTCDate(
    start.getUTCDate() -
    1
  );

  const end = new Date();
  end.setUTCDate(
    end.getUTCDate() +
    90
  );

  const appointments =
    await listMicrosoftBookingCalendarView(
      accessToken,
      bookingBusinessId,
      start.toISOString(),
      end.toISOString()
    );
logger.info(
  "[MicrosoftBookingsSync] calendarView result",
  {
    agentId:
      normalizedAgentId,

    bookingBusinessId,

    appointmentCount:
      appointments.length,

    appointments:
      appointments.map(
        (
          appointment: any
        ) => ({
          id:
            s(
              appointment?.id
            ),

          isCancelled:
            appointment?.isCancelled ??
            null,

          createdDateTime:
            appointment?.createdDateTime ??
            null,

          lastUpdatedDateTime:
            appointment?.lastUpdatedDateTime ??
            null,

          customerName:
            appointment?.customerName ??
            null,

          customerEmail:
            appointment?.customerEmailAddress ??
            null,
        })
      ),
  }
);


  let matched = 0;
  let unmatched = 0;
  let cancelled = 0;
  let createdEvents = 0;
  let cancelledEvents = 0;

  for (const appointment of appointments) {
    const appointmentId =
      s(appointment?.id);

    if (!appointmentId) {
      continue;
    }

    const customer =
      getAppointmentCustomer(
        appointment
      );

    const isCancelled =
      appointment?.isCancelled ===
      true;

    if (isCancelled) {
      cancelled++;
    }

    const contactDoc =
      await findMatchingContact(
        db,
        normalizedAgentId,
        customer.phone,
        customer.email
      );

    const appointmentRef =
      (db as any).doc(
        `agents/${normalizedAgentId}/booking_appointments/${appointmentDocumentId(
          appointmentId
        )}`
      );

    const existingAppointmentSnap =
      await appointmentRef.get();

    const timestamp = nowTs();

    await appointmentRef.set(
      {
        agentId:
          normalizedAgentId,

        appointmentId,
        bookingBusinessId,

        contactId:
          contactDoc?.id ||
          null,

        customerName:
          customer.name ||
          null,

        customerEmail:
          customer.email ||
          null,

        customerPhone:
          customer.phone ||
          null,

        serviceId:
          s(appointment?.serviceId) ||
          null,

        serviceName:
          s(appointment?.serviceName) ||
          null,

        staffMemberIds:
          Array.isArray(
            appointment?.staffMemberIds
          )
            ? appointment.staffMemberIds
            : [],

        startAt:
          getAppointmentStart(
            appointment
          ),

        endAt:
          getAppointmentEnd(
            appointment
          ),

        isCancelled,

        matchStatus:
          contactDoc
            ? "matched"
            : "unmatched",

        rawJson:
          JSON.stringify(
            appointment
          ),

        lastSeenAt:
          timestamp,

        updatedAt:
          timestamp,

        ...(existingAppointmentSnap.exists
          ? {}
          : {
            firstSeenAt:
              timestamp,

            createdAt:
              timestamp,
          }),
      },
      {
        merge:
          true,
      }
    );

    if (!contactDoc) {
      unmatched++;
      continue;
    }

    matched++;

    const triggerType:
      | "microsoft_booking_created"
      | "microsoft_booking_cancelled" =
      isCancelled
        ? "microsoft_booking_cancelled"
        : "microsoft_booking_created";

    const eventResult =
      await createBookingMagicTouchEvent({
        db,

        agentId:
          normalizedAgentId,

        contactId:
          contactDoc.id,

        appointmentId,

        bookingBusinessId,

        appointment,

        customer,

        triggerType,
      });

    if (eventResult.created) {
      if (
        triggerType ===
        "microsoft_booking_cancelled"
      ) {
        cancelledEvents++;
      } else {
        createdEvents++;
      }
    }

    await appointmentRef.set(
      {
        contactId:
          contactDoc.id,

        matchStatus:
          "matched",

        lastEventId:
          eventResult.eventId,

        lastEventType:
          triggerType,

        lastEventCreated:
          eventResult.created,

        lastEventAt:
          eventResult.created
            ? nowTs()
            : null,

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );
  }

  const result:
    MicrosoftBookingsSyncResult = {
      appointments:
        appointments.length,

      matched,
      unmatched,
      cancelled,
      createdEvents,
      cancelledEvents,
    };

  await configRef.set(
    {
      status:
        "connected",

      connected:
        true,

      lastSyncAt:
        nowTs(),

      lastSyncStatus:
        "success",

      lastSyncError:
        null,

      lastSyncAppointmentCount:
        result.appointments,

      lastSyncMatchedCount:
        result.matched,

      lastSyncUnmatchedCount:
        result.unmatched,

      lastSyncCancelledCount:
        result.cancelled,

      lastSyncCreatedEventCount:
        result.createdEvents,

      lastSyncCancelledEventCount:
        result.cancelledEvents,

      updatedAt:
        nowTs(),
    },
    {
      merge:
        true,
    }
  );

  return result;
}
