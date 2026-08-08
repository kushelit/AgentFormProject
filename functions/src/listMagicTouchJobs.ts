/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  listMagicTouchJobsImpl,
} from "./listMagicTouchJobs.impl";

export const listMagicTouchJobs =
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
      return listMagicTouchJobsImpl({
        uid:
          request.auth?.uid ||
          null,
      });
    }
  );