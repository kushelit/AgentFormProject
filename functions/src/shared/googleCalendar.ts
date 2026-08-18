/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./admin";

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./secrets";

import {
  decryptJsonAes256Gcm,
  encryptJsonAes256Gcm,
} from "./cryptoAesGcm";

const GOOGLE_TOKEN_URL =
  "https://oauth2.googleapis.com/token";

const GOOGLE_CALENDAR_API_BASE =
  "https://www.googleapis.com/calendar/v3";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

type GoogleStoredTokens = {
  accessToken?: string;

  refreshToken?: string;

  accessTokenExpiresAtMs?: number;

  tokenType?: string;

  scope?: string;

  updatedAtMs?: number;

  [key: string]: any;
};

export type GoogleCalendarConnection = {
  agentId: string;

  selectedCalendarId: string;

  selectedCalendarName:
    string |
    null;

  selectedCalendarTimeZone:
    string |
    null;

  accessToken: string;
};

export type GoogleCalendarEventsResult = {
  events:
    Record<string, any>[];

  nextSyncToken:
    string |
    null;
};

async function refreshGoogleAccessToken(
  refreshToken:
    string
): Promise<Record<string, any>> {
  const clientId =
    s(
      GOOGLE_CLIENT_ID.value()
    );

  const clientSecret =
    s(
      GOOGLE_CLIENT_SECRET.value()
    );

  if (
    !clientId ||
    !clientSecret
  ) {
    throw new HttpsError(
      "internal",
      "Missing Google OAuth credentials"
    );
  }

  const body =
    new URLSearchParams();

  body.set(
    "client_id",
    clientId
  );

  body.set(
    "client_secret",
    clientSecret
  );

  body.set(
    "refresh_token",
    refreshToken
  );

  body.set(
    "grant_type",
    "refresh_token"
  );

  const response =
    await fetch(
      GOOGLE_TOKEN_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          body.toString(),
      }
    );

  const payload =
    await response.json() as
      Record<string, any>;

  if (
    !response.ok
  ) {
    throw new HttpsError(
      "failed-precondition",
      s(
        payload
          ?.error_description
      ) ||
      s(
        payload
          ?.error
      ) ||
      "Google access token refresh failed"
    );
  }

  return payload;
}

export async function getGoogleCalendarConnection(
  agentId:
    string
): Promise<GoogleCalendarConnection> {
  const normalizedAgentId =
    s(
      agentId
    );

  if (
    !normalizedAgentId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const db =
    adminDb();

  const configRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/config/googleCalendar`
    );

  const secretRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/secrets/googleCalendar`
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
    configSnap.data()?.connected !==
      true
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Google Calendar is not connected"
    );
  }

  if (
    !secretSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Google Calendar credentials were not found"
    );
  }

  const config =
    configSnap.data() as any;

  const selectedCalendarId =
    s(
      config
        ?.selectedCalendarId
    );

  if (
    !selectedCalendarId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "No Google Calendar is selected"
    );
  }

  const keyB64 =
    s(
      PORTAL_ENC_KEY_B64.value()
    );

  if (
    !keyB64
  ) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const decrypted =
    decryptJsonAes256Gcm(
      keyB64,
      secretSnap.data()?.enc
    ) as GoogleStoredTokens;

  let accessToken =
    s(
      decrypted
        ?.accessToken
    );

  const refreshToken =
    s(
      decrypted
        ?.refreshToken
    );

  const expiresAtMs =
    Number(
      decrypted
        ?.accessTokenExpiresAtMs ||
      0
    );

  /*
   * מרעננים דקה לפני התפוגה.
   */
  const shouldRefresh =
    !accessToken ||
    !expiresAtMs ||
    Date.now() >
      expiresAtMs -
      60 * 1000;

  if (
    shouldRefresh
  ) {
    if (
      !refreshToken
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Google refresh token is missing"
      );
    }

    const refreshed =
      await refreshGoogleAccessToken(
        refreshToken
      );

    accessToken =
      s(
        refreshed
          .access_token
      );

    if (
      !accessToken
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Google did not return an access token"
      );
    }

    const nextExpiresAtMs =
      Date.now() +
      Number(
        refreshed
          .expires_in ||
        3600
      ) *
      1000;

    /*
     * Google בדרך כלל לא מחזירה
     * refresh token חדש בזמן refresh,
     * ולכן נשמור את הקיים.
     */
    const encryptedTokens =
      encryptJsonAes256Gcm(
        keyB64,
        {
          ...decrypted,

          accessToken,

          refreshToken,

          accessTokenExpiresAtMs:
            nextExpiresAtMs,

          tokenType:
            s(
              refreshed
                .token_type
            ) ||
            s(
              decrypted
                .tokenType
            ),

          scope:
            s(
              refreshed
                .scope
            ) ||
            s(
              decrypted
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
  }

  return {
    agentId:
      normalizedAgentId,

    selectedCalendarId,

    selectedCalendarName:
      s(
        config
          ?.selectedCalendarName
      ) ||
      null,

    selectedCalendarTimeZone:
      s(
        config
          ?.selectedCalendarTimeZone
      ) ||
      null,

    accessToken,
  };
}

export async function getGoogleCalendarBookingUrl(
  agentId: string
): Promise<string> {
  const normalizedAgentId =
    s(agentId);

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
      `agents/${normalizedAgentId}/config/googleCalendar`
    );

  const configSnap =
    await configRef.get();

  if (
    !configSnap.exists ||
    configSnap.data()?.connected !== true
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Google Calendar is not connected"
    );
  }

  const bookingUrl =
    s(
      configSnap.data()
        ?.defaultBookingUrl
    );

  if (!bookingUrl) {
    throw new HttpsError(
      "failed-precondition",
      "Google Calendar default booking URL is missing for this agent"
    );
  }

  return bookingUrl;
}

export async function listGoogleCalendarEvents({
  accessToken,
  calendarId,
  updatedMin,
  timeMin,
  timeMax,
}: {
  accessToken:
    string;

  calendarId:
    string;

  updatedMin?:
    string |
    null;

  timeMin?:
    string |
    null;

  timeMax?:
    string |
    null;
}): Promise<GoogleCalendarEventsResult> {
  const normalizedAccessToken =
    s(
      accessToken
    );

  const normalizedCalendarId =
    s(
      calendarId
    );

  if (
    !normalizedAccessToken ||
    !normalizedCalendarId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Google Calendar request parameters"
    );
  }

  const allEvents:
    Record<string, any>[] = [];

  let pageToken =
    "";

  let nextSyncToken:
    string |
    null =
      null;

  do {
    const url =
      new URL(
        `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
          normalizedCalendarId
        )}/events`
      );

    /*
     * singleEvents=true:
     * recurring events are expanded into actual instances.
     */
    url.searchParams.set(
      "singleEvents",
      "true"
    );

    /*
     * חשוב כדי לקבל גם ביטולים.
     */
    url.searchParams.set(
      "showDeleted",
      "true"
    );

    url.searchParams.set(
      "maxResults",
      "250"
    );

    if (
      timeMin
    ) {
      url.searchParams.set(
        "timeMin",
        timeMin
      );
    }

    if (
      timeMax
    ) {
      url.searchParams.set(
        "timeMax",
        timeMax
      );
    }

    if (
      updatedMin
    ) {
      url.searchParams.set(
        "updatedMin",
        updatedMin
      );
    }

    if (
      pageToken
    ) {
      url.searchParams.set(
        "pageToken",
        pageToken
      );
    }

    const response =
      await fetch(
        url.toString(),
        {
          method:
            "GET",

          headers: {
            Authorization:
              `Bearer ${normalizedAccessToken}`,
          },
        }
      );

    const payload =
      await response.json() as any;

    if (
      !response.ok
    ) {
      throw new HttpsError(
        "failed-precondition",
        s(
          payload
            ?.error
            ?.message
        ) ||
        "Could not load Google Calendar events"
      );
    }

    if (
      Array.isArray(
        payload?.items
      )
    ) {
      allEvents.push(
        ...payload.items
      );
    }

    pageToken =
      s(
        payload
          ?.nextPageToken
      );

    nextSyncToken =
      s(
        payload
          ?.nextSyncToken
      ) ||
      nextSyncToken;
  } while (
    pageToken
  );

  return {
    events:
      allEvents,

    nextSyncToken,
  };
}