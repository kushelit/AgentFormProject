/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  runSurenseCreateWorkflowImpl,
} from "./runSurenseCreateWorkflow.impl";

export const runSurenseCreateWorkflow =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      secrets: [
        PORTAL_ENC_KEY_B64,
      ],
    },
    async (
      request
    ) => {
      if (
        !request.auth?.uid
      ) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      return runSurenseCreateWorkflowImpl({
        agentId:
          request.data
            ?.agentId,

        customerId:
          request.data
            ?.customerId,

        requestedBy:
          request.auth.uid,
      });
    }
  );