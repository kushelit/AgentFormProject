/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const syncMicrosoftBookingsNow =
  onCall(
    {
      region: FUNCTIONS_REGION,

      secrets: [
        MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET,
        PORTAL_ENC_KEY_B64,
      ],

      timeoutSeconds: 300,

      memory: "512MiB",
    },

    async (request) => {
      const mod =
        await import(
          "./syncMicrosoftBookingsNow.impl"
        );

      return mod.syncMicrosoftBookingsNowImpl({
        uid:
          request.auth?.uid ||
          null,

        agentId:
          request.data?.agentId,
      });
    }
  );