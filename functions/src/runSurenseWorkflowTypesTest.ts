/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  runSurenseWorkflowTypesTestImpl,
} from "./runSurenseWorkflowTypesTest.impl";

export const runSurenseWorkflowTypesTest =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        60,

      memory:
        "256MiB",

      secrets: [
        PORTAL_ENC_KEY_B64,
      ],
    },

    async (
      request
    ) => {
      if (!request.auth?.uid) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      return runSurenseWorkflowTypesTestImpl({
        agentId:
          request.data
            ?.agentId,

        requestedBy:
          request.auth.uid,
      });
    }
  );