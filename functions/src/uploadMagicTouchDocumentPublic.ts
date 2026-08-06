/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {onCall} from "firebase-functions/v2/https";
import {FUNCTIONS_REGION} from "./shared/region";

export const uploadMagicTouchDocumentPublic = onCall({
  region: FUNCTIONS_REGION,
  timeoutSeconds: 60,
  memory: "512MiB",
}, async (req) => {
  const mod = await import("./uploadMagicTouchDocumentPublic.impl");
  return mod.uploadMagicTouchDocumentPublicImpl(req);
});
