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
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  adminDb,
} from "./shared/admin";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export const startGoogleCalendarAuth =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      secrets: [
        GOOGLE_CLIENT_ID,
        PORTAL_ENC_KEY_B64,
      ],

      timeoutSeconds:
        30,

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

      const agentId =
        requestedAgentId ||
        callerUid;

      /*
       * משתמש רגיל רשאי לחבר רק את עצמו.
       * isSystem רשאי לחבר את הסוכן הפעיל שנבחר בממשק.
       */
      if (
        agentId !==
        callerUid
      ) {
        const db =
          adminDb();

        const callerRef =
          (db as any).doc(
            `users/${callerUid}`
          );

        const callerSnap =
          await callerRef.get();

        const callerData =
          callerSnap.exists
            ? callerSnap.data()
            : null;

        const isSystem =
          callerData?.isSystem ===
          true;

        if (
          !isSystem
        ) {
          throw new HttpsError(
            "permission-denied",
            "You are not allowed to connect Google Calendar for this agent."
          );
        }
      }

      const mod =
        await import(
          "./startGoogleCalendarAuth.impl"
        );

      return mod
        .startGoogleCalendarAuthImpl(
          agentId
        );
    }
  );
