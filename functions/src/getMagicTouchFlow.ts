/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const getMagicTouchFlow =
  onCall(
    {
      region: FUNCTIONS_REGION,
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async (req) => {
      const mod =
        await import(
          "./getMagicTouchFlow.impl"
        );

      return mod
        .getMagicTouchFlowImpl(
          req
        );
    }
  );
