/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const saveMagicTouchFlow =
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
    async (req) => {
      const mod =
        await import(
          "./saveMagicTouchFlow.impl"
        );

      return mod
        .saveMagicTouchFlowImpl(
          req
        );
    }
  );