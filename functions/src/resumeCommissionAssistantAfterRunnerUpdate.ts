/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const resumeCommissionAssistantAfterRunnerUpdate =
  onDocumentWritten(
    {
      region:
        FUNCTIONS_REGION,

      document:
        "portalRunnerStatus/{agentId}",

      secrets: [
        PORTAL_ENC_KEY_B64,
      ],

      timeoutSeconds:
        120,

      memory:
        "256MiB",
    },

    async (
      event
    ) => {
      const mod =
        await import(
          "./resumeCommissionAssistantAfterRunnerUpdate.impl"
        );

      return mod
        .resumeCommissionAssistantAfterRunnerUpdateImpl(
          event
        );
    }
  );
