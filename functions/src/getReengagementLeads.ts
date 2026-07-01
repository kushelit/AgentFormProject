/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";

export const getReengagementLeads = onCall(
  {
    region: FUNCTIONS_REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req) => {
    const agentId = req.auth?.uid;
    if (!agentId) throw new HttpsError("unauthenticated", "Login required");

    const mod = await import("./getReengagementLeads.impl");
    return mod.getReengagementLeadsImpl(agentId);
  }
);