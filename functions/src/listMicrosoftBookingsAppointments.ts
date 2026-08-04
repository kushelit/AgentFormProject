/* eslint-disable max-len */

import { onCall } from "firebase-functions/v2/https";

import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  listMicrosoftBookingsAppointmentsImpl,
} from "./listMicrosoftBookingsAppointments.impl";

const REGION =
  process.env.FUNCTIONS_REGION ||
  "europe-west1";

export const listMicrosoftBookingsAppointments =
  onCall(
    {
      region: REGION,
      timeoutSeconds: 120,
      memory: "256MiB",

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