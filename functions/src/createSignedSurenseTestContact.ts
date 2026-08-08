/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  createSignedSurenseTestContactImpl,
} from "./createSignedSurenseTestContact.impl";

export const createSignedSurenseTestContact =
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
      return createSignedSurenseTestContactImpl({
        uid:
          request.auth?.uid ||
          null,

        confirmation:
          request.data
            ?.confirmation,

        workflowId:
          request.data
            ?.workflowId,
      });
    }
  );