/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onRequest,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const magicTouchContactsWebhook =
  onRequest(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        30,

      memory:
        "256MiB",
    },

    async (req, res) => {
      const mod =
        await import(
          "./magicTouchContactsWebhook.impl"
        );

      return mod
        .magicTouchContactsWebhookImpl(
          req,
          res
        );
    }
  );