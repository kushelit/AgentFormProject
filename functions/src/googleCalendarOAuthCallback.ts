/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onRequest,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const googleCalendarOAuthCallback =
  onRequest(
    {
      region:
        FUNCTIONS_REGION,

      secrets: [
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        PORTAL_ENC_KEY_B64,
      ],

      timeoutSeconds:
        60,

      memory:
        "256MiB",
    },

    async (
      req,
      res
    ) => {
      const mod =
        await import(
          "./googleCalendarOAuthCallback.impl"
        );

      await mod
        .googleCalendarOAuthCallbackImpl(
          req,
          res
        );
    }
  );