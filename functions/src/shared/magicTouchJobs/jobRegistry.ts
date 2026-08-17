/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  MagicTouchJobAction,
  MagicTouchJobDefinition,
} from "./jobTypes";

import {
  processWaitingPowerOfAttorneySignatures,
} from "../processWaitingPowerOfAttorneySignatures";

import {
  syncMicrosoftBookingsAllAgents,
} from "./syncMicrosoftBookingsAllAgents";

export const DEFAULT_SIGNATURE_JOB_ID =
  "surense_power_of_attorney_signature_check";

export const DEFAULT_MICROSOFT_BOOKINGS_SYNC_JOB_ID =
  "microsoft_bookings_sync_all";

export const DEFAULT_MAGIC_TOUCH_JOBS:
Record<
  string,
  MagicTouchJobDefinition
> = {
  [DEFAULT_SIGNATURE_JOB_ID]: {
    jobId:
      DEFAULT_SIGNATURE_JOB_ID,

    name:
      "בדיקת חתימות ייפוי כוח בשורנס",

    description:
      "בודק את כל אנשי הקשר שממתינים לחתימה מול שירות Get Customer של הסוכן המתאים.",

    action:
      "processWaitingPowerOfAttorneySignatures",

    enabled:
      false,

    scope: {
      type:
        "all_eligible_agents",

      integration:
        "surense",

      integrationAction:
        "getCustomer",
    },

    schedule: {
      type:
        "manual",

      timeZone:
        "Asia/Jerusalem",
    },

    nextRunAt:
      null,

    lastRunAt:
      null,

    lastRunStatus:
      null,

    lastRunSummary:
      null,

    lastRunError:
      null,

    runningRunId:
      null,

    lockUntil:
      null,
  },

  [DEFAULT_MICROSOFT_BOOKINGS_SYNC_JOB_ID]: {
    jobId:
      DEFAULT_MICROSOFT_BOOKINGS_SYNC_JOB_ID,

    name:
      "סנכרון Microsoft Bookings לכל הסוכנים",

    description:
      "מסנכרן פגישות Microsoft Bookings עבור כל הסוכנים שיש להם חיבור Microsoft 365 פעיל.",

    action:
      "syncMicrosoftBookingsAllAgents",

    enabled:
      false,

    scope: {
      type:
        "all_eligible_agents",

      integration:
        "microsoftBookings",

      integrationAction:
        "syncAppointments",
    },

    schedule: {
      type:
        "manual",

      timeZone:
        "Asia/Jerusalem",
    },

    nextRunAt:
      null,

    lastRunAt:
      null,

    lastRunStatus:
      null,

    lastRunSummary:
      null,

    lastRunError:
      null,

    runningRunId:
      null,

    lockUntil:
      null,
  },
};

export async function executeMagicTouchJobAction(
  action: MagicTouchJobAction
): Promise<Record<string, unknown>> {
  switch (action) {
    case "processWaitingPowerOfAttorneySignatures":
      return processWaitingPowerOfAttorneySignatures();

    case "syncMicrosoftBookingsAllAgents":
      return syncMicrosoftBookingsAllAgents();

    default: {
      const exhaustive:
        never =
        action;

      throw new Error(
        `Unsupported MagicTouch job action: ${String(exhaustive)}`
      );
    }
  }
}