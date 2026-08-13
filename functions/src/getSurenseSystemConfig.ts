/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const getSurenseSystemConfig =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        60,

      memory:
        "256MiB",
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
          "./getSurenseSystemConfig.impl"
        );

      return mod
        .getSurenseSystemConfigImpl({
          requestedBy:
            request.auth.uid,
        });
    }
  );