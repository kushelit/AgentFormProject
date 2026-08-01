/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const getMagicTouchContactDetails =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        30,

      memory:
        "256MiB",
    },

    async (req) => {
      const mod =
        await import(
          "./getMagicTouchContactDetails.impl"
        );

      return mod
        .getMagicTouchContactDetailsImpl(
          req
        );
    }
  );