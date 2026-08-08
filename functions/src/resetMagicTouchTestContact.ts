/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  resetMagicTouchTestContactImpl,
} from "./resetMagicTouchTestContact.impl";

export const resetMagicTouchTestContact =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        120,

      memory:
        "256MiB",
    },

    async (request) => {
      return resetMagicTouchTestContactImpl({
        uid:
          request.auth?.uid ||
          null,

        mode:
          request.data?.mode,

        confirmation:
          request.data?.confirmation,
      });
    }
  );