/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
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
      if (!req.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

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

export const getMagicTouchCampaigns =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        60,

      memory:
        "256MiB",
    },

    async (req) => {
      if (!req.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      const mod =
        await import(
          "./sendMagicTouchWhatsAppCampaign.impl"
        );

      return mod
        .getMagicTouchCampaignsImpl(
          req
        );
    }
  );

export const mergeMagicTouchCampaigns =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        540,

      memory:
        "1GiB",
    },

    async (req) => {
      if (!req.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      const mod =
        await import(
          "./sendMagicTouchWhatsAppCampaign.impl"
        );

      return mod
        .mergeMagicTouchCampaignsImpl(
          req
        );
    }
  );

