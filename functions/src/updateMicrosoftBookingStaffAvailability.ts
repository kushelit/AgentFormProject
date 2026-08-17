/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

export const updateMicrosoftBookingStaffAvailability =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        60,

      memory:
        "256MiB",

      secrets: [
        MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET,
        PORTAL_ENC_KEY_B64,
      ],
    },

    async (
      request
    ) => {
      const mod =
        await import(
          "./updateMicrosoftBookingStaffAvailability.impl"
        );

      return mod
        .updateMicrosoftBookingStaffAvailabilityImpl({
          uid:
            request.auth?.uid ||
            null,

          staffMemberId:
            request.data
              ?.staffMemberId,

          workingHours:
            request.data
              ?.workingHours,

          timeZone:
            request.data
              ?.timeZone,
        });
    }
  );