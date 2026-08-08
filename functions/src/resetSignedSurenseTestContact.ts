/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  resetSignedSurenseTestContactImpl,
} from "./resetSignedSurenseTestContact.impl";

export const resetSignedSurenseTestContact =
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