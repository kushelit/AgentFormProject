/* eslint-disable require-jsdoc */

import {
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const syncMagicTouchHumanAttention =
  onDocumentWritten(
    {
      region:
        FUNCTIONS_REGION,

      document:
        "agents/{agentId}/magic_touch_events/{eventId}",

      timeoutSeconds:
        60,

      memory:
        "256MiB",
    },

    async (
      event
    ) => {
      const mod =
        await import(
          "./syncMagicTouchHumanAttention.impl"
        );

      return mod
        .syncMagicTouchHumanAttentionImpl(
          event
        );
    }
  );
