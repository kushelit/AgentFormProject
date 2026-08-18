/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  adminDb,
} from "./shared/admin";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

export const syncGoogleCalendarAppointments =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      secrets: [
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        PORTAL_ENC_KEY_B64,
      ],

      timeoutSeconds:
        120,

      memory:
        "256MiB",
    },

    async (
      req
    ) => {
      const callerUid =
        s(
          req.auth?.uid
        );

      if (
        !callerUid
      ) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      const requestedAgentId =
        s(
          req.data?.agentId
        );

      /*
       * שימוש רגיל:
       * הסוכן מסנכרן את עצמו.
       *
       * Monitor:
       * isSystem יכול לבחור סוכן אחר.
       */
      const targetAgentId =
        requestedAgentId ||
        callerUid;

      if (
        targetAgentId !==
        callerUid
      ) {
        const db =
          adminDb();

        const callerSnap =
          await (db as any)
            .doc(
              `users/${callerUid}`
            )
            .get();

        const caller =
          callerSnap.exists
            ? callerSnap.data()
            : {};

        if (
          caller?.isSystem !==
          true
        ) {
          throw new HttpsError(
            "permission-denied",
            "Only a system administrator can sync another agent"
          );
        }
      }

      const mod =
        await import(
          "./syncGoogleCalendarAppointments.impl"
        );

      return mod
        .syncGoogleCalendarAppointmentsImpl({
          agentId:
            targetAgentId,
        });
    }
  );