/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";

export const sendReengagementBatch = onCall(
  {
    region: FUNCTIONS_REGION,
    secrets: ["WA_ACCESS_TOKEN", "WA_PHONE_NUMBER_ID"],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req) => {
    const agentId = req.auth?.uid;
    if (!agentId) throw new HttpsError("unauthenticated", "Login required");

    const mod = await import("./sendReengagementBatch.impl");
    return mod.sendReengagementBatchImpl(agentId);
  }
);