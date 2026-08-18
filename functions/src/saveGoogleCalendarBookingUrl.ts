/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const saveGoogleCalendarBookingUrl =
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

      const bookingUrl =
        String(
          req.data?.bookingUrl ??
          ""
        ).trim();

      const mod =
        await import(
          "./saveGoogleCalendarBookingUrl.impl"
        );

      return mod
        .saveGoogleCalendarBookingUrlImpl(
          agentId,
          bookingUrl
        );
    }
  );