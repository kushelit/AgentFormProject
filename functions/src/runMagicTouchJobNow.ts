/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  SURENSE_ACTIVITY_API_KEY,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  runMagicTouchJobNowImpl,
} from "./runMagicTouchJobNow.impl";

export const runMagicTouchJobNow =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        540,

      memory:
        "512MiB",

      secrets: [
        SURENSE_ACTIVITY_API_KEY,
        MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET,
        PORTAL_ENC_KEY_B64,
      ],
    },

    async (
      request
    ) => {
      return runMagicTouchJobNowImpl({
        uid:
          request.auth?.uid ||
          null,

        jobId:
          request.data
            ?.jobId,
      });
    }
  );