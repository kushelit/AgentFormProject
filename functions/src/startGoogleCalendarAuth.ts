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
  GOOGLE_CLIENT_ID,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const startGoogleCalendarAuth =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      secrets: [
        GOOGLE_CLIENT_ID,
        PORTAL_ENC_KEY_B64,
      ],

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

      const mod =
        await import(
          "./startGoogleCalendarAuth.impl"
        );

      return mod
        .startGoogleCalendarAuthImpl(
          agentId
        );
    }
  );