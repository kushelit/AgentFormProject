/* eslint-disable max-len */

import { onCall } from "firebase-functions/v2/https";
import { resetMagicTouchTestContactImpl } from "./resetMagicTouchTestContact.impl";

const REGION = process.env.FUNCTIONS_REGION || "europe-west1";

export const resetMagicTouchTestContact = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (request) => {
    return resetMagicTouchTestContactImpl({
      uid: request.auth?.uid || null,
      mode: request.data?.mode,
      confirmation: request.data?.confirmation,
    });
  }
);
