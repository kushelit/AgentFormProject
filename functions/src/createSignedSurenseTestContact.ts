/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  createSignedSurenseTestContactImpl,
} from "./createSignedSurenseTestContact.impl";

const REGION =
  process.env.FUNCTIONS_REGION ||
  "europe-west1";

export const createSignedSurenseTestContact =
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
