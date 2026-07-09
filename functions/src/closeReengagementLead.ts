/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";
import { SURENSE_ACTIVITY_API_KEY } from "./shared/secrets";

export const closeReengagementLead = onCall(
  {
    region: FUNCTIONS_REGION,
    secrets: [SURENSE_ACTIVITY_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (req) => {
    const agentId = req.auth?.uid;
    if (!agentId) throw new HttpsError("unauthenticated", "Login required");

    const surenseId = String(req.data?.surenseId ?? "").trim();
    if (!surenseId) throw new HttpsError("invalid-argument", "Missing surenseId");

    const note = String(req.data?.note ?? "").trim();

    const mod = await import("./closeReengagementLead.impl");
    return mod.closeReengagementLeadImpl(agentId, surenseId, note);
  }
);