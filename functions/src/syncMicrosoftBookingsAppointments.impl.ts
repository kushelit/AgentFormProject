/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "firebase-functions";
import { adminDb, nowTs } from "./shared/admin";
import {
  syncMicrosoftBookingsAgent,
} from "./shared/microsoftBookingsSync";

function s(value: any): string {
  return String(value ?? "").trim();
}

export async function syncMicrosoftBookingsAppointmentsImpl():
Promise<void> {
  const db = adminDb();

  const connectionsSnap = await (db as any)
    .collection("microsoft_bookings_connections")
    .where("connected", "==", true)
    .get();

  logger.info(
    "[syncMicrosoftBookingsAppointments] sync started",
    {
      connectionCount: connectionsSnap.size,
    }
  );

  for (const connectionDoc of connectionsSnap.docs) {
    const connection = connectionDoc.data() as any;

    const agentId =
      s(connection?.agentId) ||
      connectionDoc.id;

    if (!agentId) {
      continue;
    }

    try {
      const result =
        await syncMicrosoftBookingsAgent(agentId);

      logger.info(
        "[syncMicrosoftBookingsAppointments] agent synced",
        {
          agentId,
          ...result,
        }
      );
    } catch (error: any) {
      logger.error(
        "[syncMicrosoftBookingsAppointments] agent sync failed",
        {
          agentId,
          error:
            error?.message ||
            String(error),
        }
      );

      await (db as any)
        .doc(
          `agents/${agentId}/config/microsoftBookings`
        )
        .set(
          {
            lastSyncAt: nowTs(),
            lastSyncStatus: "failed",
            lastSyncError:
              error?.message ||
              String(error),
            updatedAt: nowTs(),
          },
          { merge: true }
        );
    }
  }
}