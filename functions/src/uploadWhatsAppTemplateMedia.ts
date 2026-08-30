/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onCall } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";
import {
  PORTAL_ENC_KEY_B64,
  META_APP_ID,
} from "./shared/secrets";

export const uploadWhatsAppTemplateMedia = onCall(
  {
    region: FUNCTIONS_REGION,
    secrets: [
      PORTAL_ENC_KEY_B64,
      META_APP_ID,
    ],
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (req) => {
    const mod = await import(
      "./uploadWhatsAppTemplateMedia.impl"
    );

    return mod.uploadWhatsAppTemplateMediaImpl(req);
  }
);