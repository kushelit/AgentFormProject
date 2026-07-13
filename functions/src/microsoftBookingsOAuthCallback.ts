/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onRequest } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";
import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const microsoftBookingsOAuthCallback = onRequest(
  {
    region: FUNCTIONS_REGION,
    secrets: [
      MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET,
      PORTAL_ENC_KEY_B64,
    ],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    const mod = await import("./microsoftBookingsOAuthCallback.impl");
    await mod.microsoftBookingsOAuthCallbackImpl(req, res);
  }
);