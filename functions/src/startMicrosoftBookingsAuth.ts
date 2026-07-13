/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import { FUNCTIONS_REGION } from "./shared/region";

import {
  MICROSOFT_CLIENT_ID,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const startMicrosoftBookingsAuth = onCall(
  {
    region: FUNCTIONS_REGION,

    secrets: [
      MICROSOFT_CLIENT_ID,
      PORTAL_ENC_KEY_B64,
    ],

    timeoutSeconds: 30,
    memory: "256MiB",
  },

  async (req) => {
    const agentId = req.auth?.uid;

    if (!agentId) {
      throw new HttpsError(
        "unauthenticated",
        "Login required"
      );
    }

    const mod = await import(
      "./startMicrosoftBookingsAuth.impl"
    );

    return mod.startMicrosoftBookingsAuthImpl(
      agentId
    );
  }
);