/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";

export const updateReengagementLeadStatus = onCall(
  {
    region: FUNCTIONS_REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (req) => {
    const agentId = req.auth?.uid;
    if (!agentId) throw new HttpsError("unauthenticated", "Login required");

    const surenseId = String(req.data?.surenseId ?? "").trim();
    const status = String(req.data?.status ?? "").trim();

    if (!surenseId) throw new HttpsError("invalid-argument", "Missing surenseId");

    const mod = await import("./updateReengagementLeadStatus.impl");
    return mod.updateReengagementLeadStatusImpl(agentId, surenseId, status);
  }
);