/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  SURENSE_ACTIVITY_API_KEY,
} from "./shared/secrets";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  processWaitingPowerOfAttorneySignatures,
} from "./shared/processWaitingPowerOfAttorneySignatures";

import {
  assertMagicTouchJobsAdmin,
} from "./shared/magicTouchJobs/jobPermissions";

/*
 * הפעלה ידנית של בדיקת חתימות ייפוי כוח.
 *
 * מיועדת למסך הניהול של MagicTouch
 * ודורשת הרשאת access_magic_touch_jobs_admin.
 *
 * הבדיקה עצמה משתמשת באותו core
 * שמשמש גם את מנגנון ה-Jobs.
 */
export const processWaitingPowerOfAttorneySignaturesNow =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        540,

      memory:
        "512MiB",

      secrets: [
        SURENSE_ACTIVITY_API_KEY,
      ],
    },

    async (request) => {
      await assertMagicTouchJobsAdmin(
        request.auth?.uid ||
        null
      );

      return processWaitingPowerOfAttorneySignatures();
    }
  );