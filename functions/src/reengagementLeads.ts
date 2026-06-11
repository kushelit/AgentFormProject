
/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { onRequest } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";

/**
 * reengagementLeadsWebhook
 * HTTP endpoint שמקבל מ-Make לקוחות לתהליך reengagement
 * מאובטח עם x-api-key header
 */
export const reengagementLeadsWebhook = onRequest(
  {
    region: FUNCTIONS_REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    const mod = await import("./reengagementLeads.impl");
    return mod.reengagementLeadsWebhookImpl(req, res);
  }
);