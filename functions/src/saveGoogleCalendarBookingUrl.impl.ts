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

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function validateBookingUrl(
  value:
    string
): void {
  if (
    !value
  ) {
    return;
  }

  let url:
    URL;

  try {
    url =
      new URL(
        value
      );
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "Invalid booking URL"
    );
  }

  if (
    url.protocol !==
    "https:"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Booking URL must use HTTPS"
    );
  }

  const hostname =
    s(
      url.hostname
    ).toLowerCase();

  /*
   * Google משתמשת כיום בשני סוגי כתובות
   * עבור דפי קביעת פגישות:
   *
   * calendar.google.com
   * calendar.app.google
   */
  const allowedHosts = [
    "calendar.google.com",
    "calendar.app.google",
  ];

  if (
    !allowedHosts.includes(
      hostname
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The booking URL must be a Google Calendar booking URL"
    );
  }
}

export async function saveGoogleCalendarBookingUrlImpl(
  agentId:
    string,
  bookingUrl:
    string
): Promise<object> {
  const normalizedAgentId =
    s(
      agentId
    );

  const normalizedBookingUrl =
    s(
      bookingUrl
    );

  if (
    !normalizedAgentId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  validateBookingUrl(
    normalizedBookingUrl
  );

  const db =
    adminDb();

  const configRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/config/googleCalendar`
    );

  const configSnap =
    await configRef.get();

  if (
    !configSnap.exists ||
    configSnap.data()?.connected !==
      true
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Google Calendar is not connected"
    );
  }

  const selectedCalendarId =
    s(
      configSnap.data()
        ?.selectedCalendarId
    );

  if (
    !selectedCalendarId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Select a Google Calendar first"
    );
  }

  await configRef.set(
    {
      defaultBookingUrl:
        normalizedBookingUrl ||
        null,

      bookingUrlUpdatedAt:
        nowTs(),

      updatedAt:
        nowTs(),
    },
    {
      merge:
        true,
    }
  );

  return {
    ok:
      true,

    defaultBookingUrl:
      normalizedBookingUrl ||
      null,
  };
}