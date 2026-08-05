/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  updateMagicTouchJobImpl,
} from "./updateMagicTouchJob.impl";

const REGION =
  process.env.FUNCTIONS_REGION ||
  "europe-west1";

export const updateMagicTouchJob =
  onCall(
    {
      region:
        REGION,

      timeoutSeconds:
        60,

      memory:
        "256MiB",
    },

    async (
      request
    ) => {
      return updateMagicTouchJobImpl({
        uid:
          request.auth?.uid ||
          null,

        jobId:
          request.data
            ?.jobId,

        enabled:
          request.data
            ?.enabled,

        schedule:
          request.data
            ?.schedule,
      });
    }
  );
