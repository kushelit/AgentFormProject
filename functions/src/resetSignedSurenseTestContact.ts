/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  resetSignedSurenseTestContactImpl,
} from "./resetSignedSurenseTestContact.impl";

const REGION =
  process.env.FUNCTIONS_REGION ||
  "europe-west1";

export const resetSignedSurenseTestContact =
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
      return resetSignedSurenseTestContactImpl({
        uid:
          request.auth?.uid ||
          null,

        confirmation:
          request.data
            ?.confirmation,
      });
    }
  );
