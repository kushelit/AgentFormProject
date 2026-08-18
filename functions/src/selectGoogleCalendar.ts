/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const selectGoogleCalendar =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        30,

      memory:
        "256MiB",
    },

    async (
      req
    ) => {
      const agentId =
        req.auth?.uid;

      if (
        !agentId
      ) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      const calendarId =
        String(
          req.data?.calendarId ??
          ""
        ).trim();

      if (
        !calendarId
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Missing calendarId"
        );
      }

      const mod =
        await import(
          "./selectGoogleCalendar.impl"
        );

      return mod
        .selectGoogleCalendarImpl(
          agentId,
          calendarId
        );
    }
  );