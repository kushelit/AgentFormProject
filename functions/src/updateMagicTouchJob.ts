/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  updateMagicTouchJobImpl,
} from "./updateMagicTouchJob.impl";

export const updateMagicTouchJob =
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