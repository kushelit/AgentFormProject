/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  logger,
} from "firebase-functions";

import {
  adminDb,
  nowTs,
} from "./admin";

import {
  PORTAL_ENC_KEY_B64,
} from "./secrets";

import {
  decryptJsonAes256Gcm,
  encryptJsonAes256Gcm,
} from "./cryptoAesGcm";

import {
  getMicrosoftBookingAppointmentDiagnostic,
  listMicrosoftBookingCalendarView,
  refreshMicrosoftAccessToken,
} from "./microsoftGraph";


import {
  addMagicTouchTimelineEvent,
} from "./magicTouchTimelineService";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizePhone(
  phone: string
): string {
  const digits =
    s(phone).replace(
      /\D/g,
      ""
    );

  if (
    digits.startsWith(
      "972"
    )
  ) {
    return digits;
  }

  if (
    digits.startsWith(
      "0"
    )
  ) {
    return `972${digits.slice(1)}`;
  }

  if (
    digits.length === 9
  ) {
    return `972${digits}`;
  }

  return digits;
}

function normalizeEmail(
  email: string
): string {
  return s(
    email
  ).toLowerCase();
}

function sha256(
  value: string
): string {
  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}

function appointmentDocumentId(
  appointmentId: string
): string {
  return sha256(
    appointmentId
  );
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
    Array.isArray(
      appointment?.customers
    ) &&
    appointment.customers.length > 0
      ? appointment.customers[0]
      : {};

  return {
    name:
      s(
        customer?.name
      ) ||
      s(
        appointment?.customerName
      ),

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
    appointment?.startAt ??
    appointment?.startDateTime ??
    null
  );
}

function getAppointmentEnd(
  appointment: any
): any {
  return (
    appointment?.end ??
    appointment?.endAt ??
    appointment?.endDateTime ??
    null
  );
}

function toDateOrNull(
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

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return new Date(
      value.toMillis()
    );
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

function isAppointmentInsideWindow(
  appointment: any,
  start: Date,
  end: Date
): boolean {
  const appointmentStart =
    toDateOrNull(
      getAppointmentStart(
        appointment
      )
    );

  if (!appointmentStart) {
    return false;
  }

  const appointmentStartMs =
    appointmentStart.getTime();

  return (
    appointmentStartMs >=
      start.getTime() &&
    appointmentStartMs <=
      end.getTime()
  );
}

async function findMatchingContact(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  customerPhone: string,
  customerEmail: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const contactsCollection =
    db.collection(
      `agents/${agentId}/magic_touch_contacts`
    );

  if (customerPhone) {
    const phoneSnap =
      await contactsCollection
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

    if (
      !normalizedEmailSnap.empty
    ) {
      return normalizedEmailSnap
        .docs[0];
    }

    const emailSnap =
      await contactsCollection
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
  conversationId,
  appointmentId,
  bookingBusinessId,
  appointment,
  customer,
  triggerType,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  contactId: string;
  conversationId: string | null;
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

  const eventRef =
    db.doc(
      `agents/${agentId}/magic_touch_events/${eventId}`
    );

  const eventSnap =
    await eventRef.get();

  if (eventSnap.exists) {
    return {
      created: false,
      eventId,
    };
  }

  const timestamp =
    nowTs();

  await eventRef.create({
    agentId,
    eventId,

    triggerType,

    channel:
      "microsoft_bookings",

    sourceSystem:
      "microsoft_bookings",

    contactId,

    conversationId:
      conversationId ||
      null,

    bookingAppointmentId:
      appointmentId,

    bookingBusinessId,

    bookingServiceId:
      s(
        appointment?.serviceId
      ) ||
      null,

    bookingServiceName:
      s(
        appointment?.serviceName
      ) ||
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
  const contactRef =
  db.doc(
    `agents/${agentId}/magic_touch_contacts/${contactId}`
  );

const bookingUpdate =
  triggerType ===
  "microsoft_booking_cancelled"
    ? {
        "engagement.reengagement.bookingStatus":
          "cancelled",

        "engagement.reengagement.bookingCancelledAt":
          timestamp,

        "engagement.reengagement.bookingAppointmentId":
          appointmentId,

        "engagement.reengagement.bookingStartAt":
          getAppointmentStart(
            appointment
          ),

        "engagement.reengagement.bookingEndAt":
          getAppointmentEnd(
            appointment
          ),

        "engagement.reengagement.bookingServiceName":
          s(
            appointment?.serviceName
          ) ||
          null,

        updatedAt:
          timestamp,
      }
    : {
        "engagement.reengagement.bookingStatus":
          "booked",

        "engagement.reengagement.bookedAt":
          timestamp,

        "engagement.reengagement.bookingAppointmentId":
          appointmentId,

        "engagement.reengagement.bookingStartAt":
          getAppointmentStart(
            appointment
          ),

        "engagement.reengagement.bookingEndAt":
          getAppointmentEnd(
            appointment
          ),

        "engagement.reengagement.bookingServiceName":
          s(
            appointment?.serviceName
          ) ||
          null,

        updatedAt:
          timestamp,
      };

await contactRef.set(
  bookingUpdate,
  {
    merge: true,
  }
);
try {
  const isCancelled =
    triggerType ===
    "microsoft_booking_cancelled";

  await addMagicTouchTimelineEvent({
    agentId,

    contactId,

    type:
      isCancelled
        ? "microsoft_booking_cancelled"
        : "microsoft_booking_created",

    channel:
      "microsoft_bookings",

    title:
      isCancelled
        ? "בוטלה פגישה"
        : "נקבעה פגישה",

    description:
      s(
        appointment?.serviceName
      )
        ? (
          isCancelled
            ? `בוטלה פגישה: ${s(appointment?.serviceName)}`
            : `נקבעה פגישה: ${s(appointment?.serviceName)}`
        )
        : (
          isCancelled
            ? "הפגישה ב־Microsoft Bookings בוטלה."
            : "נקבעה פגישה חדשה ב־Microsoft Bookings."
        ),

    direction:
      "inbound",

    status:
      "completed",

    createdBy:
      "microsoft_bookings_sync",

    sourceSystem:
      "microsoft_bookings",

    sourceRecordId:
      appointmentId,

    metadata: {
      eventId,

      appointmentId,

      bookingBusinessId,

      serviceId:
        s(
          appointment?.serviceId
        ) ||
        null,

      serviceName:
        s(
          appointment?.serviceName
        ) ||
        null,

      bookingStartAt:
        getAppointmentStart(
          appointment
        ),

      bookingEndAt:
        getAppointmentEnd(
          appointment
        ),

      triggerType,
    },
  });
} catch (
  timelineError: any
) {
  logger.error(
    "[MicrosoftBookingsSync] Timeline event failed",
    {
      agentId,

      contactId,

      appointmentId,

      triggerType,

      eventId,

      error:
        timelineError?.message ||
        String(
          timelineError
        ),
    }
  );
}
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
    s(
      agentId
    );

  if (!normalizedAgentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
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

  /*
   * חלון הסנכרון:
   * מאתמול ועד 90 ימים קדימה.
   */
  const start =
    new Date();

  start.setUTCDate(
    start.getUTCDate() -
    1
  );

  const end =
    new Date();

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

      appointmentIds:
        appointments.map(
          (
            appointment: any
          ) =>
            s(
              appointment?.id
            )
        ),
    }
  );

  /*
   * כל מזהי הפגישות שחזרו בסנכרון הנוכחי.
   * נשווה אותם בהמשך לפגישות שכבר שמורות אצלנו.
   */
  const returnedAppointmentIds =
    new Set<string>();

  let matched = 0;
  let unmatched = 0;
  let cancelled = 0;
  let createdEvents = 0;
  let cancelledEvents = 0;

  /*
   * שלב א':
   * טיפול בכל הפגישות שמיקרוסופט החזירה.
   */
  for (
    const appointment of appointments
  ) {
    const appointmentId =
      s(
        appointment?.id
      );

    if (!appointmentId) {
      continue;
    }

    returnedAppointmentIds.add(
      appointmentId
    );

    const customer =
      getAppointmentCustomer(
        appointment
      );

    /*
     * השדה נשאר כתמיכה עתידית,
     * אף שבבדיקה שלנו Microsoft הסירה
     * פגישה מבוטלת במקום להחזיר isCancelled.
     */
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

    const contactData =
      contactDoc
        ? (
          contactDoc.data() as
            Record<string, any>
        )
        : null;

    const conversationId =
      contactDoc
        ? (
          s(
            contactData
              ?.whatsappConversationId
          ) ||
          (
            customer.phone
              ? `${normalizedAgentId}_${customer.phone}`
              : ""
          ) ||
          null
        )
        : null;

    const appointmentRef =
      (db as any).doc(
        `agents/${normalizedAgentId}/booking_appointments/${appointmentDocumentId(
          appointmentId
        )}`
      );

    const existingAppointmentSnap =
      await appointmentRef.get();

    const timestamp =
      nowTs();

    await appointmentRef.set(
      {
        agentId:
          normalizedAgentId,

        appointmentId,

        bookingBusinessId,

        contactId:
          contactDoc?.id ||
          null,

        conversationId,

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
          s(
            appointment?.serviceId
          ) ||
          null,

        serviceName:
          s(
            appointment?.serviceName
          ) ||
          null,

        staffMemberIds:
          Array.isArray(
            appointment?.staffMemberIds
          )
            ? appointment
              .staffMemberIds
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

        cancellationDetectionStatus:
          isCancelled
            ? "cancelled_returned_by_microsoft"
            : "active",

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

        ...(existingAppointmentSnap
          .exists
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

        conversationId,

        appointmentId,

        bookingBusinessId,

        appointment,

        customer,

        triggerType,
      });

    if (
      eventResult.created
    ) {
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

        ...(eventResult.created
          ? {
            lastEventAt:
              nowTs(),
          }
          : {}),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );
  }

  /*
   * שלב ב':
   * איתור פגישות שהיו שמורות אצלנו,
   * אבל לא חזרו כעת מ-calendarView.
   *
   * Microsoft הוכחה אצלנו כמסירה פגישה
   * מבוטלת מהרשימות ומחזירה 404 בקריאה ישירה.
   */
  const activeAppointmentsSnap =
    await (db as any)
      .collection(
        `agents/${normalizedAgentId}/booking_appointments`
      )
      .where(
        "isCancelled",
        "==",
        false
      )
      .limit(1000)
      .get();

  for (
    const storedAppointmentDoc of
      activeAppointmentsSnap.docs
  ) {
    const storedAppointment =
      storedAppointmentDoc.data() as any;

    const storedAppointmentId =
      s(
        storedAppointment
          ?.appointmentId
      );

    if (!storedAppointmentId) {
      continue;
    }

    /*
     * לא בודקים פגישה של עסק Bookings אחר.
     */
    if (
      s(
        storedAppointment
          ?.bookingBusinessId
      ) &&
      s(
        storedAppointment
          ?.bookingBusinessId
      ) !==
        bookingBusinessId
    ) {
      continue;
    }

    /*
     * אם היא חזרה ב-calendarView,
     * היא כבר טופלה בשלב א'.
     */
    if (
      returnedAppointmentIds.has(
        storedAppointmentId
      )
    ) {
      continue;
    }

    /*
     * בודקים רק פגישות שנמצאות בתוך
     * חלון הסנכרון הנוכחי.
     *
     * כך לא נסמן כפגישות שבוטלו
     * פגישות ישנות שכבר יצאו מהטווח.
     */
    if (
      !isAppointmentInsideWindow(
        storedAppointment,
        start,
        end
      )
    ) {
      continue;
    }

    logger.info(
      "[MicrosoftBookingsSync] appointment missing from calendarView",
      {
        agentId:
          normalizedAgentId,

        appointmentId:
          storedAppointmentId,

        contactId:
          s(
            storedAppointment
              ?.contactId
          ) ||
          null,

        startAt:
          storedAppointment
            ?.startAt ??
          null,
      }
    );

    /*
     * אימות נוסף:
     * האם Microsoft עדיין מוצאת את הפגישה
     * בקריאה ישירה לפי appointmentId?
     */
    const directLookup =
      await getMicrosoftBookingAppointmentDiagnostic(
        accessToken,
        bookingBusinessId,
        storedAppointmentId
      );

    if (
      directLookup.found
    ) {
      /*
       * הפגישה עדיין קיימת ב-Microsoft,
       * ולכן אסור לסמן אותה כמבוטלת.
       */
      await storedAppointmentDoc.ref.set(
        {
          cancellationDetectionStatus:
            "missing_from_calendar_but_direct_lookup_found",

          lastCancellationCheckAt:
            nowTs(),

          lastCancellationCheckHttpStatus:
            directLookup.status,

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      );

      logger.warn(
        "[MicrosoftBookingsSync] missing appointment still exists in direct lookup",
        {
          agentId:
            normalizedAgentId,

          appointmentId:
            storedAppointmentId,

          httpStatus:
            directLookup.status,
        }
      );

      continue;
    }

    if (
      directLookup.status !==
      404
    ) {
      /*
       * שגיאה זמנית, הרשאה, תקשורת וכו'.
       * לא מסמנים ביטול במקרה כזה.
       */
      await storedAppointmentDoc.ref.set(
        {
          cancellationDetectionStatus:
            "direct_lookup_failed",

          lastCancellationCheckAt:
            nowTs(),

          lastCancellationCheckHttpStatus:
            directLookup.status,

          lastCancellationCheckError:
            directLookup.error ||
            null,

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      );

      logger.warn(
        "[MicrosoftBookingsSync] direct lookup failed while checking cancellation",
        {
          agentId:
            normalizedAgentId,

          appointmentId:
            storedAppointmentId,

          httpStatus:
            directLookup.status,

          error:
            directLookup.error ||
            null,
        }
      );

      continue;
    }

    /*
     * הפגישה לא חזרה ברשימה וגם הקריאה הישירה
     * החזירה 404.
     *
     * לפי הבדיקה שביצענו זהו ביטול מאומת.
     */
    cancelled++;

    const contactId =
      s(
        storedAppointment
          ?.contactId
      );

    const customer = {
      name:
        s(
          storedAppointment
            ?.customerName
        ),

      email:
        normalizeEmail(
          storedAppointment
            ?.customerEmail
        ),

      phone:
        normalizePhone(
          storedAppointment
            ?.customerPhone
        ),
    };

    let cancellationConversationId =
      s(
        storedAppointment
          ?.conversationId
      ) ||
      null;

    if (
      !cancellationConversationId &&
      contactId
    ) {
      const contactSnap =
        await (db as any)
          .doc(
            `agents/${normalizedAgentId}/magic_touch_contacts/${contactId}`
          )
          .get();

      if (contactSnap.exists) {
        const contactData =
          contactSnap.data() as
            Record<string, any>;

        cancellationConversationId =
          s(
            contactData
              ?.whatsappConversationId
          ) ||
          null;
      }
    }

    if (
      !cancellationConversationId &&
      customer.phone
    ) {
      cancellationConversationId =
        `${normalizedAgentId}_${customer.phone}`;
    }

    let eventResult:
      {
        created: boolean;
        eventId: string;
      } | null =
      null;

    if (contactId) {
      eventResult =
        await createBookingMagicTouchEvent({
          db,

          agentId:
            normalizedAgentId,

          contactId,

          conversationId:
            cancellationConversationId,

          appointmentId:
            storedAppointmentId,

          bookingBusinessId,

          appointment: {
            id:
              storedAppointmentId,

            serviceId:
              storedAppointment
                ?.serviceId,

            serviceName:
              storedAppointment
                ?.serviceName,

            startAt:
              storedAppointment
                ?.startAt,

            endAt:
              storedAppointment
                ?.endAt,

            customerName:
              storedAppointment
                ?.customerName,

            customerEmailAddress:
              storedAppointment
                ?.customerEmail,

            customerPhone:
              storedAppointment
                ?.customerPhone,
          },

          customer,

          triggerType:
            "microsoft_booking_cancelled",
        });

      if (
        eventResult.created
      ) {
        cancelledEvents++;
      }
    }

    await storedAppointmentDoc.ref.set(
      {
        isCancelled:
          true,

        cancelledAt:
          nowTs(),

        cancellationDetectedAt:
          nowTs(),

        cancellationDetectedBy:
          "missing_from_calendar_and_direct_lookup_404",

        cancellationDetectionStatus:
          "cancelled_confirmed",

        lastCancellationCheckAt:
          nowTs(),

        lastCancellationCheckHttpStatus:
          404,

        lastCancellationCheckError:
          directLookup.error ||
          null,

        ...(eventResult
          ? {
            lastEventId:
              eventResult.eventId,

            lastEventType:
              "microsoft_booking_cancelled",

            lastEventCreated:
              eventResult.created,

            ...(eventResult.created
              ? {
                lastEventAt:
                  nowTs(),
              }
              : {}),
          }
          : {
            lastEventCreated:
              false,

            cancellationEventSkippedReason:
              "missing_contact_id",
          }),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    logger.info(
      "[MicrosoftBookingsSync] cancellation confirmed",
      {
        agentId:
          normalizedAgentId,

        appointmentId:
          storedAppointmentId,

        contactId:
          contactId ||
          null,

        eventCreated:
          eventResult
            ?.created ||
          false,

        eventId:
          eventResult
            ?.eventId ||
          null,
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