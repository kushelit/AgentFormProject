/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";

import {
  logger,
} from "firebase-functions";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  normalizeMagicTouchEmail,
} from "./shared/magicTouchContacts";

import {
  getGoogleCalendarConnection,
  listGoogleCalendarEvents,
} from "./shared/googleCalendar";

import {
  addMagicTouchTimelineEvent,
} from "./shared/magicTouchTimelineService";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function toNullableString(
  value: any
): string | null {
  return (
    s(
      value
    ) ||
    null
  );
}

function mapPerson(
  value: any
): Record<string, any> | null {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }

  return {
    id:
      toNullableString(
        value.id
      ),

    email:
      toNullableString(
        value.email
      ),

    displayName:
      toNullableString(
        value.displayName
      ),

    self:
      value.self ===
      true,

    organizer:
      value.organizer ===
      true,

    responseStatus:
      toNullableString(
        value.responseStatus
      ),

    comment:
      toNullableString(
        value.comment
      ),
  };
}

function getEventStart(
  event: any
): string | null {
  return (
    toNullableString(
      event
        ?.start
        ?.dateTime
    ) ||
    toNullableString(
      event
        ?.start
        ?.date
    )
  );
}

function getEventEnd(
  event: any
): string | null {
  return (
    toNullableString(
      event
        ?.end
        ?.dateTime
    ) ||
    toNullableString(
      event
        ?.end
        ?.date
    )
  );
}

function getCustomerAttendee(
  event: any
): any | null {
  const attendees =
    Array.isArray(
      event?.attendees
    )
      ? event.attendees
      : [];

  /*
   * מחפשים משתתף חיצוני:
   * - לא היומן עצמו
   * - לא organizer
   * - עם כתובת email
   */
  const candidate =
    attendees.find(
      (
        attendee: any
      ) =>
        attendee?.self !==
          true &&
        attendee?.organizer !==
          true &&
        Boolean(
          s(
            attendee?.email
          )
        )
    );

  return (
    candidate ||
    null
  );
}

function getCandidateName(
  event: any,
  customerAttendee: any
): string | null {
  const attendeeName =
    s(
      customerAttendee
        ?.displayName
    );

  if (
    attendeeName
  ) {
    return attendeeName;
  }

  /*
   * Google Appointment Schedule
   * אצלנו יצר summary למשל:
   *
   * "נוני - פגישות (Amit Cohen)"
   *
   * זה fallback לתצוגה בלבד.
   * לא מבצעים matching לפי שם.
   */
  const summary =
    s(
      event?.summary
    );

  const match =
    summary.match(
      /\(([^()]+)\)\s*$/
    );

  return (
    s(
      match?.[1]
    ) ||
    null
  );
}

async function findMatchingContactByEmail(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  email: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const normalizedEmail =
    normalizeMagicTouchEmail(
      email
    );

  if (
    !normalizedEmail
  ) {
    return null;
  }

  const contactsRef =
    db.collection(
      `agents/${agentId}/magic_touch_contacts`
    );

  /*
   * זה השדה הרשמי שנוצר אצלנו
   * ב-upsertMagicTouchContact.
   */
  const normalizedSnap =
    await contactsRef
      .where(
        "emailNormalized",
        "==",
        normalizedEmail
      )
      .limit(1)
      .get();

  if (
    !normalizedSnap.empty
  ) {
    return normalizedSnap
      .docs[0];
  }

  /*
   * fallback לתמיכה באנשי קשר ישנים
   * שאולי נוצרו לפני emailNormalized.
   */
  const directEmailSnap =
    await contactsRef
      .where(
        "email",
        "==",
        email
      )
      .limit(1)
      .get();

  if (
    !directEmailSnap.empty
  ) {
    return directEmailSnap
      .docs[0];
  }

  return null;
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

function googleBookingEventDocumentId(
  agentId: string,
  googleEventId: string,
  triggerType: string
): string {
  return sha256(
    [
      "google_calendar",
      agentId,
      googleEventId,
      triggerType,
    ].join("|")
  );
}

async function createGoogleBookingMagicTouchEvent({
  db,
  agentId,
  contactId,
  conversationId,
  googleEventId,
  calendarId,
  event,
  customerEmail,
  customerName,
  triggerType,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  contactId: string;
  conversationId: string | null;
  googleEventId: string;
  calendarId: string;
  event: any;
  customerEmail: string | null;
  customerName: string | null;
  triggerType:
    | "google_booking_created"
    | "google_booking_cancelled";
}): Promise<{
  created: boolean;
  eventId: string;
}> {
  const eventId =
    googleBookingEventDocumentId(
      agentId,
      googleEventId,
      triggerType
    );

  const eventRef =
    db.doc(
      `agents/${agentId}/magic_touch_events/${eventId}`
    );

  const eventSnap =
    await eventRef.get();

  if (
    eventSnap.exists
  ) {
    return {
      created: false,
      eventId,
    };
  }

  const timestamp =
    nowTs();

  const isCancelled =
    triggerType ===
    "google_booking_cancelled";

  await eventRef.create({
    agentId,
    eventId,

    triggerType,

    channel:
      "google_calendar",

    sourceSystem:
      "google_calendar",

    contactId,

    conversationId:
      conversationId ||
      null,

    bookingAppointmentId:
      googleEventId,

    googleEventId,

    calendarId,

    bookingStartAt:
      getEventStart(
        event
      ),

    bookingEndAt:
      getEventEnd(
        event
      ),

    bookingIsCancelled:
      isCancelled,

    customerName:
      customerName ||
      null,

    customerEmail:
      customerEmail ||
      null,

    customerPhone:
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

  const contactUpdate =
    isCancelled
      ? {
        appointmentStatus:
          "cancelled",

        appointmentProvider:
          "google",

        "engagement.reengagement.bookingStatus":
          "cancelled",

        "engagement.reengagement.bookingCancelledAt":
          timestamp,

        "engagement.reengagement.bookingAppointmentId":
          googleEventId,

        "engagement.reengagement.bookingStartAt":
          getEventStart(
            event
          ),

        "engagement.reengagement.bookingEndAt":
          getEventEnd(
            event
          ),

        updatedAt:
          timestamp,
      }
      : {
        appointmentStatus:
          "booked",

        appointmentProvider:
          "google",

        "engagement.reengagement.bookingStatus":
          "booked",

        "engagement.reengagement.bookedAt":
          timestamp,

        "engagement.reengagement.bookingAppointmentId":
          googleEventId,

        "engagement.reengagement.bookingStartAt":
          getEventStart(
            event
          ),

        "engagement.reengagement.bookingEndAt":
          getEventEnd(
            event
          ),

        updatedAt:
          timestamp,
      };

  await contactRef.set(
    contactUpdate,
    {
      merge: true,
    }
  );

  try {
    await addMagicTouchTimelineEvent({
      agentId,
      contactId,

      type:
        triggerType,

      channel:
        "google_calendar",

      title:
        isCancelled
          ? "בוטלה פגישה"
          : "נקבעה פגישה",

      description:
        isCancelled
          ? "הפגישה ב־Google Calendar בוטלה."
          : "נקבעה פגישה חדשה ב־Google Calendar.",

      direction:
        "inbound",

      status:
        "completed",

      createdBy:
        "google_calendar_sync",

      sourceSystem:
        "google_calendar",

      sourceRecordId:
        googleEventId,

      metadata: {
        eventId,
        googleEventId,
        calendarId,

        summary:
          toNullableString(
            event?.summary
          ),

        bookingStartAt:
          getEventStart(
            event
          ),

        bookingEndAt:
          getEventEnd(
            event
          ),

        triggerType,
      },
    });
  } catch (
    timelineError: any
  ) {
    logger.error(
      "[syncGoogleCalendarAppointments] Timeline event failed",
      {
        agentId,
        contactId,
        googleEventId,
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

export async function syncGoogleCalendarAppointmentsImpl({
  agentId,
}: {
  agentId:
    string;
}): Promise<object> {
  const normalizedAgentId =
    s(
      agentId
    );

  if (
    !normalizedAgentId
  ) {
    throw new Error(
      "Missing agentId"
    );
  }

  const db =
    adminDb();

  const configRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/config/googleCalendar`
    );

  const startedAt =
    new Date();

  try {
    await configRef.set(
      {
        lastSyncStatus:
          "running",

        lastSyncError:
          null,

        lastSyncStartedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    const configSnap =
      await configRef.get();

    const config =
      configSnap.exists
        ? configSnap.data() as any
        : {};

    const connection =
      await getGoogleCalendarConnection(
        normalizedAgentId
      );

    /*
     * בסנכרון ראשון ניקח חלון רחב.
     *
     * לא כל האירועים בחלון יישמרו:
     * רק אירועים שמתאימים ל-MagicTouch Contact.
     */
    const firstSyncTimeMin =
      new Date(
        Date.now() -
        30 *
        24 *
        60 *
        60 *
        1000
      ).toISOString();

    const firstSyncTimeMax =
      new Date(
        Date.now() +
        365 *
        24 *
        60 *
        60 *
        1000
      ).toISOString();

    const previousSyncAtIso =
      s(
        config
          ?.lastSuccessfulSyncAtIso
      );

    const result =
      await listGoogleCalendarEvents({
        accessToken:
          connection.accessToken,

        calendarId:
          connection.selectedCalendarId,

        timeMin:
          firstSyncTimeMin,

        timeMax:
          firstSyncTimeMax,

        updatedMin:
          previousSyncAtIso ||
          null,
      });

    const events =
      result.events;

    let scannedCount =
      0;

    let matchedCount =
      0;

    let skippedCount =
      0;

    let cancelledCount =
      0;

    let customerCandidateCount =
      0;

    let createdEvents =
      0;

    let cancelledEvents =
      0;

    for (
      const event of events
    ) {
      scannedCount++;

      const eventId =
        s(
          event?.id
        );

      if (
        !eventId
      ) {
        skippedCount++;
        continue;
      }

      const appointmentRef =
        (db as any).doc(
          `agents/${normalizedAgentId}/booking_appointments/${eventId}`
        );

      /*
       * קודם בודקים אם כבר שמרנו את האירוע.
       *
       * חשוב במיוחד לביטולים:
       * Google עשויה להחזיר cancelled event
       * עם פחות מידע מהאירוע המקורי.
       */
      const existingAppointmentSnap =
        await appointmentRef.get();

      const existingAppointment =
        existingAppointmentSnap.exists
          ? existingAppointmentSnap.data() as any
          : null;

      const customerAttendee =
        getCustomerAttendee(
          event
        );

      const customerEmailCandidate =
        toNullableString(
          customerAttendee
            ?.email
        );

      const customerNameCandidate =
        getCandidateName(
          event,
          customerAttendee
        );

      if (
        customerEmailCandidate
      ) {
        customerCandidateCount++;
      }

      const status =
        s(
          event?.status
        ) ||
        "confirmed";

      /*
       * אם האירוע כבר היה משויך בעבר,
       * שומרים את ההתאמה הקיימת.
       */
      let contactId =
        s(
          existingAppointment
            ?.contactId
        );

      let conversationId =
        s(
          existingAppointment
            ?.conversationId
        );

      let resolvedCustomerEmail =
        customerEmailCandidate ||
        toNullableString(
          existingAppointment
            ?.customerEmailCandidate
        );

      let resolvedCustomerName =
        customerNameCandidate ||
        toNullableString(
          existingAppointment
            ?.customerNameCandidate
        );

      /*
       * אם אין התאמה קיימת,
       * מחפשים Contact לפי email.
       */
   if (
  !contactId &&
  resolvedCustomerEmail
) {
  const contactDoc =
    await findMatchingContactByEmail(
      db,
      normalizedAgentId,
      resolvedCustomerEmail
    );

  if (
    contactDoc
  ) {
    const contactData =
      contactDoc.data() as any;

    const bookingStatus =
      s(
        contactData
          ?.engagement
          ?.reengagement
          ?.bookingStatus
      );

    const appointmentProvider =
      s(
        contactData
          ?.appointmentProvider
      ).toLowerCase();

    /*
     * Google appointment נחשב רלוונטי
     * רק אם MagicTouch כבר שלחה ללקוח
     * קישור Google וממתינה לקביעת פגישה.
     */
    const isWaitingForGoogleBooking =
      bookingStatus ===
        "link_sent" &&
      appointmentProvider ===
        "google";

    if (
      isWaitingForGoogleBooking
    ) {
      contactId =
        contactDoc.id;

      conversationId =
        s(
          contactData
            ?.whatsappConversationId
        );

      resolvedCustomerName =
        resolvedCustomerName ||
        toNullableString(
          contactData
            ?.fullName
        );
    }
  }
}

      /*
       * זה הכלל העסקי:
       *
       * אם האירוע לא מתאים ל-Contact של
       * אותו סוכן - הוא לא פגישת MagicTouch.
       *
       * יום הולדת, אירוע פרטי, תזכורת וכו'
       * פשוט לא יישמרו ב-booking_appointments.
       */
      if (
        !contactId
      ) {
        skippedCount++;

        logger.info(
          "[syncGoogleCalendarAppointments] calendar event ignored",
          {
            agentId:
              normalizedAgentId,

            googleEventId:
              eventId,

            summary:
              s(
                event?.summary
              ) ||
              null,

            customerEmailCandidate:
              resolvedCustomerEmail ||
              null,

          reason:
  resolvedCustomerEmail
    ? "contact_not_waiting_for_google_booking"
    : "no_external_customer_email",
          }
        );

        continue;
      }

      if (
        status ===
        "cancelled"
      ) {
        cancelledCount++;
      }

      const attendees =
        Array.isArray(
          event?.attendees
        )
          ? event.attendees
            .map(
              (
                attendee: any
              ) =>
                mapPerson(
                  attendee
                )
            )
            .filter(
              Boolean
            )
          : [];

      const timestamp =
        nowTs();

      const appointmentData:
        Record<string, any> = {
          agentId:
            normalizedAgentId,

          provider:
            "google_calendar",

          sourceSystem:
            "google_calendar",

          bookingProvider:
            "google",

          googleEventId:
            eventId,

          calendarId:
            connection
              .selectedCalendarId,

          calendarName:
            connection
              .selectedCalendarName,

          contactId,

          conversationId:
            conversationId ||
            null,

          customerEmailCandidate:
            resolvedCustomerEmail ||
            null,

          customerNameCandidate:
            resolvedCustomerName ||
            null,

          customerMatchStatus:
            "matched",

          iCalUID:
            toNullableString(
              event?.iCalUID
            ),

          status,

          summary:
            toNullableString(
              event?.summary
            ),

          description:
            toNullableString(
              event?.description
            ),

          location:
            toNullableString(
              event?.location
            ),

          eventType:
            toNullableString(
              event?.eventType
            ),

          htmlLink:
            toNullableString(
              event?.htmlLink
            ),

          startAt:
            getEventStart(
              event
            ),

          endAt:
            getEventEnd(
              event
            ),

          start:
            event?.start ||
            null,

          end:
            event?.end ||
            null,

          creator:
            mapPerson(
              event?.creator
            ),

          organizer:
            mapPerson(
              event?.organizer
            ),

          attendees,

          hangoutLink:
            toNullableString(
              event?.hangoutLink
            ),

          conferenceData:
            event?.conferenceData ||
            null,

          extendedProperties:
            event?.extendedProperties ||
            null,

          googleCreatedAt:
            toNullableString(
              event?.created
            ),

          googleUpdatedAt:
            toNullableString(
              event?.updated
            ),

          googleSequence:
            Number(
              event?.sequence ||
              0
            ),

          lastSeenAt:
            timestamp,

          syncedAt:
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
        };

      if (
        status ===
        "cancelled"
      ) {
        appointmentData.cancelledAt =
          timestamp;
      }

      await appointmentRef.set(
        appointmentData,
        {
          merge:
            true,
        }
      );

      const triggerType:
        | "google_booking_created"
        | "google_booking_cancelled" =
        status ===
          "cancelled"
          ? "google_booking_cancelled"
          : "google_booking_created";

      const eventResult =
        await createGoogleBookingMagicTouchEvent({
          db,

          agentId:
            normalizedAgentId,

          contactId,

          conversationId:
            conversationId ||
            null,

          googleEventId:
            eventId,

          calendarId:
            connection
              .selectedCalendarId,

          event,

          customerEmail:
            resolvedCustomerEmail ||
            null,

          customerName:
            resolvedCustomerName ||
            null,

          triggerType,
        });

      if (
        eventResult.created
      ) {
        if (
          triggerType ===
          "google_booking_cancelled"
        ) {
          cancelledEvents++;
        } else {
          createdEvents++;
        }
      }

      await appointmentRef.set(
        {
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

      matchedCount++;
    }

    await configRef.set(
      {
        lastSyncAt:
          nowTs(),

        lastSuccessfulSyncAt:
          nowTs(),

        /*
         * משתמשים בזמן תחילת הריצה כדי
         * לא לפספס שינוי שהתרחש בזמן הסנכרון.
         */
        lastSuccessfulSyncAtIso:
          startedAt.toISOString(),

        lastSyncStatus:
          "success",

        lastSyncError:
          null,

        /*
         * כמה Google החזירה.
         */
        lastSyncScannedCount:
          scannedCount,

        /*
         * כמה באמת הפכו לפגישות MagicTouch.
         */
        lastSyncEventCount:
          matchedCount,

        lastSyncMatchedCount:
          matchedCount,

        lastSyncSkippedCount:
          skippedCount,

        lastSyncCancelledCount:
          cancelledCount,

        lastSyncCustomerCandidateCount:
          customerCandidateCount,

        lastSyncCreatedEventCount:
          createdEvents,

        lastSyncCancelledEventCount:
          cancelledEvents,

        lastSyncCompletedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    logger.info(
      "[syncGoogleCalendarAppointments] sync completed",
      {
        agentId:
          normalizedAgentId,

        calendarId:
          connection
            .selectedCalendarId,

        scannedCount,

        matchedCount,

        skippedCount,

        cancelledCount,

        customerCandidateCount,

        createdEvents,

        cancelledEvents,

        previousSyncAtIso:
          previousSyncAtIso ||
          null,
      }
    );

    return {
      ok:
        true,

      agentId:
        normalizedAgentId,

      calendarId:
        connection
          .selectedCalendarId,

      calendarName:
        connection
          .selectedCalendarName,

      /*
       * syncedCount נשמר גם לתאימות
       * ל-UI שכבר בנינו.
       */
      syncedCount:
        matchedCount,

      scannedCount,

      matchedCount,

      skippedCount,

      cancelledCount,

      customerCandidateCount,

      createdEvents,

      cancelledEvents,

      appointmentsCollection:
        `agents/${normalizedAgentId}/booking_appointments`,
    };
  } catch (
    error: any
  ) {
    const message =
      error?.message ||
      String(
        error
      );

    logger.error(
      "[syncGoogleCalendarAppointments] sync failed",
      {
        agentId:
          normalizedAgentId,

        error:
          message,
      }
    );

    await configRef.set(
      {
        lastSyncStatus:
          "failed",

        lastSyncError:
          message,

        lastSyncFailedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    throw error;
  }
}