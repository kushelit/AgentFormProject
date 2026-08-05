/* eslint-disable max-len */

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  SURENSE_ACTIVITY_API_KEY,
} from "./shared/secrets";

import {
  processDueMagicTouchJobsImpl,
} from "./processDueMagicTouchJobs.impl";

const REGION =
  process.env.FUNCTIONS_REGION ||
  "europe-west1";

/*
 * Scheduler טכני בלבד.
 * התזמון העסקי נשמר ב-Firestore ומנוהל דרך ה-UI.
 */
export const processDueMagicTouchJobs =
  onSchedule(
    {
      region:
        REGION,

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
      ],
    },

    async () => {
      await processDueMagicTouchJobsImpl();
    }
  );
