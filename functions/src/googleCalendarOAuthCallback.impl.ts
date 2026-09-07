/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  Request,
  Response,
} from "express";

import {
  logger,
} from "firebase-functions";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  encryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

import {
  consumeGoogleOAuthState,
} from "./shared/googleOAuthState";

import {
  APP_BASE_URL,
} from "./shared/appBaseUrl";

const GOOGLE_TOKEN_URL =
  "https://oauth2.googleapis.com/token";

const GOOGLE_CALENDAR_LIST_URL =
  "https://www.googleapis.com/calendar/v3/users/me/calendarList";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function getMagicSaleReturnUrl(
  params: Record<string, string>
): string {
  const url =
    new URL(
      "/MagicTouch/Integrations/GoogleCalendarSettings",
      APP_BASE_URL
    );

  for (
    const [
      key,
      value,
    ] of Object.entries(
      params
    )
  ) {
    if (
      value
    ) {
      url.searchParams.set(
        key,
        value
      );
    }
  }

  return url.toString();
}

function redirectWithError(
  res:
    Response,
  errorCode:
    string,
  message?:
    string
): void {
  const url =
    getMagicSaleReturnUrl({
      googleCalendar:
        "error",

      error:
        errorCode,

      message:
        s(
          message
        ).slice(
          0,
          300
        ),
    });

  res.redirect(
    302,
    url
  );
}

async function exchangeGoogleAuthorizationCode(
  code:
    string,
  redirectUri:
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
    "code",
    code
  );

  body.set(
    "client_id",
    clientId
  );

  body.set(
    "client_secret",
    clientSecret
  );

  body.set(
    "redirect_uri",
    redirectUri
  );

  body.set(
    "grant_type",
    "authorization_code"
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
    await response
      .json() as
        Record<
          string,
          any
        >;

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
      "Google token exchange failed"
    );
  }

  return payload;
}

async function listGoogleCalendars(
  accessToken:
    string
): Promise<Record<string, any>[]> {
  const response =
    await fetch(
      GOOGLE_CALENDAR_LIST_URL,
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );

  const payload =
    await response
      .json() as any;

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
      "Could not load Google calendars"
    );
  }

  return Array.isArray(
    payload?.items
  )
    ? payload.items
    : [];
}

export async function googleCalendarOAuthCallbackImpl(
  req:
    Request,
  res:
    Response
): Promise<void> {
  if (
    req.method !==
    "GET"
  ) {
    res.sendStatus(
      405
    );

    return;
  }

  const error =
    s(
      req.query
        .error
    );

  const errorDescription =
    s(
      req.query
        .error_description
    );

  const code =
    s(
      req.query
        .code
    );

  const state =
    s(
      req.query
        .state
    );

  if (
    error
  ) {
    logger.warn(
      "[googleCalendarOAuthCallback] Google returned an OAuth error",
      {
        error,

        errorDescription,
      }
    );

    redirectWithError(
      res,
      error,
      errorDescription
    );

    return;
  }

  if (
    !code ||
    !state
  ) {
    redirectWithError(
      res,
      "missing_code_or_state",
      "Google did not return code and state"
    );

    return;
  }

  try {
    const statePayload =
      await consumeGoogleOAuthState(
        state
      );

    const agentId =
      s(
        statePayload
          .agentId
      );

    if (
      !agentId
    ) {
      throw new HttpsError(
        "failed-precondition",
        "OAuth state does not contain an agentId"
      );
    }

    const db =
      adminDb();

    const configRef =
      (db as any).doc(
        `agents/${agentId}/config/googleCalendar`
      );

    const secretRef =
      (db as any).doc(
        `agents/${agentId}/secrets/googleCalendar`
      );

    const connectionIndexRef =
      (db as any).doc(
        `google_calendar_connections/${agentId}`
      );

    /*
     * קוראים את ההגדרה הקיימת לפני OAuth reconnect,
     * כדי שלא נאבד את היומן שהסוכן בחר
     * ואת קישור ה-Appointment Schedule.
     */
    const existingConfigSnap =
      await configRef.get();

    const existingConfig =
      existingConfigSnap.exists
        ? existingConfigSnap.data()
        : {};

    const tokenResponse =
      await exchangeGoogleAuthorizationCode(
        code,
        statePayload
          .redirectUri
      );

    const accessToken =
      s(
        tokenResponse
          .access_token
      );

    const refreshToken =
      s(
        tokenResponse
          .refresh_token
      );

    if (
      !accessToken
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Google did not return an access token"
      );
    }

    /*
     * startGoogleCalendarAuth משתמש ב:
     * access_type=offline
     * prompt=consent
     * ולכן בחיבור / reconnect אנחנו מצפים
     * ל-refresh token חדש.
     */
    if (
      !refreshToken
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Google did not return a refresh token. Reconnect Google Calendar and approve access again."
      );
    }

    const calendars =
      await listGoogleCalendars(
        accessToken
      );

    const availableCalendars =
      calendars
        .map(
          (
            calendar:
              any
          ) => ({
            id:
              s(
                calendar
                  ?.id
              ),

            summary:
              s(
                calendar
                  ?.summary ||
                calendar
                  ?.id
              ),

            description:
              s(
                calendar
                  ?.description
              ) ||
              null,

            primary:
              calendar
                ?.primary ===
              true,

            accessRole:
              s(
                calendar
                  ?.accessRole
              ) ||
              null,

            timeZone:
              s(
                calendar
                  ?.timeZone
              ) ||
              null,
          })
        )
        .filter(
          (
            calendar:
              any
          ) =>
            Boolean(
              calendar.id
            )
        );

    const writableCalendars =
      availableCalendars.filter(
        (
          calendar:
            any
        ) => {
          const role =
            s(
              calendar
                ?.accessRole
            ).toLowerCase();

          return (
            role ===
              "owner" ||
            role ===
              "writer"
          );
        }
      );

    const primaryCalendar =
      writableCalendars.find(
        (
          calendar:
            any
        ) =>
          calendar
            .primary ===
          true
      ) ||
      null;

    const existingSelectedCalendarId =
      s(
        existingConfig
          ?.selectedCalendarId
      );

    const existingSelectedCalendar =
      existingSelectedCalendarId
        ? writableCalendars.find(
            (
              calendar:
                any
            ) =>
              calendar.id ===
              existingSelectedCalendarId
          ) ||
          null
        : null;

    const selectedCalendar =
      existingSelectedCalendar ||
      primaryCalendar ||
      (
        writableCalendars
          .length ===
        1
          ? writableCalendars[
            0
          ]
          : null
      );

    const expiresAtMs =
      Date.now() +
      Number(
        tokenResponse
          .expires_in ||
        3600
      ) *
      1000;

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

    const encryptedTokens =
      encryptJsonAes256Gcm(
        keyB64,
        {
          accessToken,

          refreshToken,

          accessTokenExpiresAtMs:
            expiresAtMs,

          tokenType:
            s(
              tokenResponse
                .token_type
            ),

          scope:
            s(
              tokenResponse
                .scope
            ),

          updatedAtMs:
            Date.now(),
        }
      );

    const connectedGoogleAccount =
      s(
        primaryCalendar
          ?.id
      ) ||
      s(
        existingConfig
          ?.googleAccount
      ) ||
      null;

    const existingBookingUrl =
      s(
        existingConfig
          ?.defaultBookingUrl
      ) ||
      null;

    const configData:
      Record<
        string,
        any
      > = {
        status:
          availableCalendars
            .length >
          0
            ? "connected"
            : "no_calendars",

        connected:
          availableCalendars
            .length >
          0,

        googleAccount:
          connectedGoogleAccount,

        availableCalendars,

        selectedCalendarId:
          selectedCalendar
            ?.id ||
          null,

        selectedCalendarName:
          selectedCalendar
            ?.summary ||
          null,

        selectedCalendarTimeZone:
          selectedCalendar
            ?.timeZone ||
          null,

        defaultBookingUrl:
          existingBookingUrl,

        scope:
          s(
            tokenResponse
              .scope
          ),

        lastSyncAt:
          null,

        lastSyncStatus:
          "not_started",

        lastSyncError:
          null,

        connectedAt:
          nowTs(),

        connectedBy:
          agentId,

        updatedAt:
          nowTs(),
      };

    await Promise.all([
      secretRef.set(
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
      ),

      configRef.set(
        configData,
        {
          merge:
            true,
        }
      ),

      connectionIndexRef.set(
        {
          agentId,

          status:
            configData
              .status,

          connected:
            configData
              .connected,

          selectedCalendarId:
            selectedCalendar
              ?.id ||
            null,

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      ),
    ]);

    logger.info(
      "[googleCalendarOAuthCallback] Google Calendar connected",
      {
        agentId,

        calendarCount:
          availableCalendars
            .length,

        writableCalendarCount:
          writableCalendars
            .length,

        selectedCalendarId:
          selectedCalendar
            ?.id ||
          null,

        preservedExistingCalendar:
          Boolean(
            existingSelectedCalendar
          ),

        preservedBookingUrl:
          Boolean(
            existingBookingUrl
          ),

        hasPrimaryCalendar:
          Boolean(
            primaryCalendar
          ),
      }
    );

    const returnUrl =
      getMagicSaleReturnUrl({
        googleCalendar:
          configData
            .connected
            ? "connected"
            : configData
              .status,

        connected:
          configData
            .connected
            ? "true"
            : "false",

        calendarCount:
          String(
            availableCalendars
              .length
          ),
      });

    res.redirect(
      302,
      returnUrl
    );
  } catch (
    callbackError:
      any
  ) {
    logger.error(
      "[googleCalendarOAuthCallback] callback failed",
      callbackError
    );

    redirectWithError(
      res,
      callbackError
        ?.code ||
      "callback_failed",

      callbackError
        ?.message ||
      "Google Calendar callback failed"
    );
  }
}
