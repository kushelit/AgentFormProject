/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const diagnoseMicrosoftBookingAppointment =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      secrets: [
        MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET,
        PORTAL_ENC_KEY_B64,
      ],

      timeoutSeconds:
        300,

      memory:
        "512MiB",
    },

    async (
      req
    ) => {
      const agentId =
        String(
          req.auth?.uid ??
          ""
        ).trim();

      if (!agentId) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      const appointmentId =
        String(
          req.data
            ?.appointmentId ??
          ""
        ).trim();

      if (!appointmentId) {
        throw new HttpsError(
          "invalid-argument",
          "Missing appointmentId"
        );
      }

      const mod =
        await import(
          "./diagnoseMicrosoftBookingAppointment.impl"
        );

      return mod
        .diagnoseMicrosoftBookingAppointmentImpl(
          agentId,
          appointmentId
        );
    }
  );