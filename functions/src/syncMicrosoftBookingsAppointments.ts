/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FUNCTIONS_REGION } from "./shared/region";
import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const syncMicrosoftBookingsAppointments = onSchedule(
  {
    region: FUNCTIONS_REGION,
    schedule: "every 10 minutes",
    timeZone: "Asia/Jerusalem",
    secrets: [
      MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET,
      PORTAL_ENC_KEY_B64,
    ],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    const mod = await import(
      "./syncMicrosoftBookingsAppointments.impl"
    );

    await mod.syncMicrosoftBookingsAppointmentsImpl();
  }
);