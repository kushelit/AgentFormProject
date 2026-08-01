/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onRequest,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const magicTouchContactsApi =
  onRequest(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        60,

      memory:
        "256MiB",
    },

    async (req, res) => {
      const mod =
        await import(
          "./magicTouchContactsApi.impl"
        );

      return mod
        .magicTouchContactsApiImpl(
          req,
          res
        );
    }
  );