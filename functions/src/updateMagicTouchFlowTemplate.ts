import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  updateMagicTouchFlowTemplateImpl,
} from "./updateMagicTouchFlowTemplate.impl";

export const updateMagicTouchFlowTemplate =
  onCall(
    {
      region:
        FUNCTIONS_REGION,
    },
    updateMagicTouchFlowTemplateImpl
  );