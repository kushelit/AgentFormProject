/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  listMagicTouchJobsImpl,
} from "./listMagicTouchJobs.impl";

const REGION =
  process.env.FUNCTIONS_REGION ||
  "europe-west1";

export const listMagicTouchJobs =
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
      return listMagicTouchJobsImpl({
        uid:
          request.auth?.uid ||
          null,
      });
    }
  );
