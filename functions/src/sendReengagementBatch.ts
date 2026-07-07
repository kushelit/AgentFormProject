/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";
import { PORTAL_ENC_KEY_B64, SURENSE_ACTIVITY_API_KEY } from "./shared/secrets";

export const sendReengagementBatch = onCall(
  {
    region: FUNCTIONS_REGION,
    secrets: [PORTAL_ENC_KEY_B64, SURENSE_ACTIVITY_API_KEY],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req) => {
    const agentId = req.auth?.uid;
    if (!agentId) throw new HttpsError("unauthenticated", "Login required");

    const leadIds: string[] | undefined = Array.isArray(req.data?.leadIds)
      ? req.data.leadIds.filter((id: any) => typeof id === "string" && id.trim().length > 0)
      : undefined;

    const templateName = typeof req.data?.templateName === "string"
      ? req.data.templateName.trim()
      : undefined;

    const mod = await import("./sendReengagementBatch.impl");
    return mod.sendReengagementBatchImpl(agentId, leadIds, templateName);
  }
);
