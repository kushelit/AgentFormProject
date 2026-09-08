/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const getMagicTouchDashboard =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        120,

      memory:
        "512MiB",
    },

    async (req) => {
      if (!req.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      const mod =
        await import(
          "./getMagicTouchDashboard.impl"
        );

      return mod
        .getMagicTouchDashboardImpl(
          req
        );
    }
  );
