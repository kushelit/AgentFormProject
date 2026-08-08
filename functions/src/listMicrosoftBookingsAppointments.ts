/* eslint-disable max-len */

import {
  onCall,
} from "firebase-functions/v2/https";

import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  listMicrosoftBookingsAppointmentsImpl,
} from "./listMicrosoftBookingsAppointments.impl";

export const listMicrosoftBookingsAppointments =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        120,

      memory:
        "256MiB",

      secrets: [
        MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET,
        PORTAL_ENC_KEY_B64,
      ],
    },

    async (request) => {
      return listMicrosoftBookingsAppointmentsImpl({
        uid:
          request.auth?.uid ||
          null,

        agentId:
          request.data?.agentId,
      });
    }
  );