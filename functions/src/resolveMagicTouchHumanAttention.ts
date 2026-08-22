/* eslint-disable require-jsdoc */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const resolveMagicTouchHumanAttention =
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
      const mod =
        await import(
          "./resolveMagicTouchHumanAttention.impl"
        );

      return mod
        .resolveMagicTouchHumanAttentionImpl(
          request
        );
    }
  );
