/* eslint-disable max-len */

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import { SURENSE_ACTIVITY_API_KEY } from "./shared/secrets";
import {
  processWaitingPowerOfAttorneySignatures,
} from "./shared/processWaitingPowerOfAttorneySignatures";

const REGION =
  process.env.FUNCTIONS_REGION ||
  "europe-west1";

/*
 * הפעלה ידנית בזמן פיתוח.
 * דורשת משתמש מחובר, ללא דרישת role: admin.
 */
export const processWaitingPowerOfAttorneySignaturesNow =
  onCall(
    {
      region:
        REGION,
      timeoutSeconds:
        540,
      memory:
        "512MiB",
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

      return processWaitingPowerOfAttorneySignatures();
    }
  );
