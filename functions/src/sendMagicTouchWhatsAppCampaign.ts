/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const sendMagicTouchWhatsAppCampaign =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      secrets: [
        PORTAL_ENC_KEY_B64,
      ],

      timeoutSeconds:
        300,

      memory:
        "512MiB",
    },

    async (req) => {
      const mod =
        await import(
          "./sendMagicTouchWhatsAppCampaign.impl"
        );

      return mod
        .sendMagicTouchWhatsAppCampaignImpl(
          req
        );
    }
  );