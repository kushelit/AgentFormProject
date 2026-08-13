/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const saveSurenseSystemConfig =
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
          "./saveSurenseSystemConfig.impl"
        );

      return mod
        .saveSurenseSystemConfigImpl({
          ...request.data,

          updatedBy:
            request.auth.uid,
        });
    }
  );