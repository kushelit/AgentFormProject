/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  PORTAL_ENC_KEY_B64,
  SURENSE_ACTIVITY_API_KEY,
} from "./shared/secrets";

export const resumeMagicTouchFlowAfterDocumentUpload =
  onDocumentUpdated(
    {
      document:
        "agents/{agentId}/magic_touch_document_requests/{requestId}",

      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        120,

      memory:
        "256MiB",

      secrets: [
        PORTAL_ENC_KEY_B64,
        SURENSE_ACTIVITY_API_KEY,
      ],
    },

    async (event: any) => {
      const mod =
        await import(
          "./resumeMagicTouchFlowAfterDocumentUpload.impl"
        );

      return mod
        .resumeMagicTouchFlowAfterDocumentUploadImpl(
          event
        );
    }
  );