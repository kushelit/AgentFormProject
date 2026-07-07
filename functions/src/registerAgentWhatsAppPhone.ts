/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onCall } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";

export const registerAgentWhatsAppPhone = onCall(
  {
    region: FUNCTIONS_REGION,
    secrets: [PORTAL_ENC_KEY_B64],
    memory: "256MiB",
  },
  async (req) => {
    const mod = await import("./registerAgentWhatsAppPhone.impl");
    return mod.registerAgentWhatsAppPhoneImpl(req);
  }
);