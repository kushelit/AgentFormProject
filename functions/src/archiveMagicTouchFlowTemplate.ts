/* eslint-disable require-jsdoc */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const archiveMagicTouchFlowTemplate =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        60,

      memory:
        "256MiB",
    },

    async (
      req
    ) => {
      const mod =
        await import(
          "./archiveMagicTouchFlowTemplate.impl"
        );

      return mod
        .archiveMagicTouchFlowTemplateImpl(
          req
        );
    }
  );