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

export const createMicrosoftBookingService =
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
          "./createMicrosoftBookingService.impl"
        );

      return mod
        .createMicrosoftBookingServiceImpl({
          uid:
            request.auth?.uid ||
            null,

          displayName:
            request.data
              ?.displayName,

          description:
            request.data
              ?.description,

          durationMinutes:
            request.data
              ?.durationMinutes,

          preBufferMinutes:
            request.data
              ?.preBufferMinutes,

          postBufferMinutes:
            request.data
              ?.postBufferMinutes,

          minimumLeadTimeMinutes:
            request.data
              ?.minimumLeadTimeMinutes,

          maximumAdvanceDays:
            request.data
              ?.maximumAdvanceDays,

          timeSlotIntervalMinutes:
            request.data
              ?.timeSlotIntervalMinutes,

          staffMemberId:
            request.data
              ?.staffMemberId,
        });
    }
  );