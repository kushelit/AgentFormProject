/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const getAgentSurenseIncomingConfig =
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
          "./manageAgentSurenseIncomingKey.impl"
        );

      return mod
        .getAgentSurenseIncomingConfigImpl(
          request.data
        );
    }
  );

export const rotateAgentSurenseIncomingKey =
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
          "./manageAgentSurenseIncomingKey.impl"
        );

      return mod
        .rotateAgentSurenseIncomingKeyImpl({
          ...request.data,

          rotatedBy:
            request.auth.uid,
        });
    }
  );
