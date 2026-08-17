/* eslint-disable max-len */

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  SURENSE_ACTIVITY_API_KEY,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  processDueMagicTouchJobsImpl,
} from "./processDueMagicTouchJobs.impl";

/*
 * Scheduler טכני בלבד.
 * התזמון העסקי נשמר ב-Firestore ומנוהל דרך ה-UI.
 */
export const processDueMagicTouchJobs =
  onSchedule(
    {
      region:
        FUNCTIONS_REGION,

      schedule:
        "every 15 minutes",

      timeZone:
        "UTC",

      timeoutSeconds:
        540,

      memory:
        "512MiB",

      secrets: [
        SURENSE_ACTIVITY_API_KEY,
        MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET,
        PORTAL_ENC_KEY_B64,
      ],
    },

    async () => {
      await processDueMagicTouchJobsImpl();
    }
  );