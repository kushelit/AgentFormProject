/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import { FUNCTIONS_REGION } from "./shared/region";
import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const selectMicrosoftBookingsBusiness = onCall(
  {
    region: FUNCTIONS_REGION,
    secrets: [
      MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET,
      PORTAL_ENC_KEY_B64,
    ],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req) => {
    const agentId = req.auth?.uid;

    if (!agentId) {
      throw new HttpsError(
        "unauthenticated",
        "Login required"
      );
    }

    const businessId = String(
      req.data?.businessId ?? ""
    ).trim();

    if (!businessId) {
      throw new HttpsError(
        "invalid-argument",
        "Missing businessId"
      );
    }

    const mod = await import(
      "./selectMicrosoftBookingsBusiness.impl"
    );

    return mod.selectMicrosoftBookingsBusinessImpl(
      agentId,
      businessId
    );
  }
);