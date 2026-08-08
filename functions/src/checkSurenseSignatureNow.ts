/* eslint-disable max-len */

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  SURENSE_ACTIVITY_API_KEY,
} from "./shared/secrets";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  checkSinglePowerOfAttorneySignature,
} from "./shared/checkSinglePowerOfAttorneySignature";

/*
 * בדיקה ידנית של לקוח יחיד.
 */
export const checkSurenseSignatureNow =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        120,

      memory:
        "256MiB",

      secrets: [
        SURENSE_ACTIVITY_API_KEY,
      ],
    },

    async (request) => {
      if (!request.auth?.uid) {
        throw new HttpsError(
          "unauthenticated",
          "A signed-in user is required"
        );
      }

      const agentId =
        String(
          request.data
            ?.agentId ||
            ""
        ).trim();

      const contactId =
        String(
          request.data
            ?.contactId ||
            ""
        ).trim();

      if (!agentId || !contactId) {
        throw new HttpsError(
          "invalid-argument",
          "Missing agentId or contactId"
        );
      }

      return checkSinglePowerOfAttorneySignature({
        agentId,
        contactId,
      });
    }
  );