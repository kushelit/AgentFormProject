/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const runSurenseCustomerImport =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        120,

      memory:
        "256MiB",

      /*
       * ה-Direct API צריך לפענח
       * את OAuth credentials של הסוכן.
       */
      secrets: [
        PORTAL_ENC_KEY_B64,
      ],
    },

    async (
      request
    ) => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      const mod =
        await import(
          "./runSurenseCustomerImport.impl"
        );

      return mod
        .runSurenseCustomerImportImpl({
          ...request.data,

          requestedBy:
            request.auth.uid,
        });
    }
  );