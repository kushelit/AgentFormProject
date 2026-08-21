/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const getMagicTouchAISettings =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        30,

      memory:
        "256MiB",
    },

    async (
      request
    ) => {
      const mod =
        await import(
          "./magicTouchAISettings.impl"
        );

      return mod
        .getMagicTouchAISettingsImpl(
          request
        );
    }
  );

export const saveSystemMagicTouchAISettings =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        30,

      memory:
        "256MiB",
    },

    async (
      request
    ) => {
      const mod =
        await import(
          "./magicTouchAISettings.impl"
        );

      return mod
        .saveSystemMagicTouchAISettingsImpl(
          request
        );
    }
  );

export const saveAgentMagicTouchAISettings =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        30,

      memory:
        "256MiB",
    },

    async (
      request
    ) => {
      const mod =
        await import(
          "./magicTouchAISettings.impl"
        );

      return mod
        .saveAgentMagicTouchAISettingsImpl(
          request
        );
    }
  );