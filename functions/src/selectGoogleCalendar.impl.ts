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

export async function selectGoogleCalendarImpl(
  agentId:
    string,
  calendarId:
    string
): Promise<object> {
  const normalizedAgentId =
    s(
      agentId
    );

  const normalizedCalendarId =
    s(
      calendarId
    );

  if (
    !normalizedAgentId ||
    !normalizedCalendarId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId or calendarId"
    );
  }

  const db =
    adminDb();

  const configRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/config/googleCalendar`
    );

  const configSnap =
    await configRef.get();

  if (
    !configSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Google Calendar is not connected"
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
      "Google Calendar is not connected"
    );
  }

  const availableCalendars =
    Array.isArray(
      config?.availableCalendars
    )
      ? config.availableCalendars
      : [];

  const calendar =
    availableCalendars.find(
      (
        item: any
      ) =>
        s(
          item?.id
        ) ===
        normalizedCalendarId
    );

  if (
    !calendar
  ) {
    throw new HttpsError(
      "not-found",
      "Calendar was not found in this Google connection"
    );
  }

  const accessRole =
    s(
      calendar
        ?.accessRole
    ).toLowerCase();

  if (
    accessRole !==
      "owner" &&
    accessRole !==
      "writer"
  ) {
    throw new HttpsError(
      "permission-denied",
      "The selected calendar is read-only"
    );
  }

  const selectedCalendarName =
    s(
      calendar?.summary
    ) ||
    normalizedCalendarId;

  const selectedCalendarTimeZone =
    s(
      calendar?.timeZone
    ) ||
    null;

  await configRef.set(
    {
      selectedCalendarId:
        normalizedCalendarId,

      selectedCalendarName,

      selectedCalendarTimeZone,

      selectedCalendarAccessRole:
        accessRole,

      selectedCalendarAt:
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

    selectedCalendarId:
      normalizedCalendarId,

    selectedCalendarName,

    selectedCalendarTimeZone,

    selectedCalendarAccessRole:
      accessRole,
  };
}