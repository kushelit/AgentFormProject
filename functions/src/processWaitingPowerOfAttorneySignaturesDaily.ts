/* eslint-disable max-len */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { SURENSE_ACTIVITY_API_KEY } from "./shared/secrets";
import {
  processWaitingPowerOfAttorneySignatures,
} from "./shared/processWaitingPowerOfAttorneySignatures";

const REGION =
  process.env.FUNCTIONS_REGION ||
  "europe-west1";

/*
 * ריצה יומית בשעה 09:00 לפי שעון ישראל.
 *
 * הפונקציה אינה שולחת WhatsApp.
 * היא רק:
 * 1. בודקת חתימות מול Surense.
 * 2. מעדכנת waiting / partial / signed.
 * 3. מסמנת reminderDue=true לאחר 24 שעות.
 */
export const processWaitingPowerOfAttorneySignaturesDaily =
  onSchedule(
    {
      region:
        REGION,
      schedule:
        "0 9 * * *",
      timeZone:
        "Asia/Jerusalem",
      timeoutSeconds:
        540,
      memory:
        "512MiB",
      secrets: [
        SURENSE_ACTIVITY_API_KEY,
      ],
    },
    async () => {
      await processWaitingPowerOfAttorneySignatures();
    }
  );
