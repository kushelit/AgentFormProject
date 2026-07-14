/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";

export async function disconnectMicrosoftBookingsImpl(
  agentId: string
): Promise<object> {
  const normalizedAgentId = String(
    agentId ?? ""
  ).trim();

  if (!normalizedAgentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const db = adminDb();

  const configRef = (db as any).doc(
    `agents/${normalizedAgentId}/config/microsoftBookings`
  );

  const secretRef = (db as any).doc(
    `agents/${normalizedAgentId}/secrets/microsoftBookings`
  );

  const indexRef = (db as any).doc(
    `microsoft_bookings_connections/${normalizedAgentId}`
  );

  const batch = (db as any).batch();

  batch.delete(secretRef);
  batch.delete(indexRef);

  batch.set(
    configRef,
    {
      status: "disconnected",
      connected: false,

      bookingBusinessId: null,
      bookingBusinessName: null,
      bookingBusinessEmail: null,
      bookingBusinessPhone: null,
      bookingBusinessPublicUrl: null,

      availableBusinesses: [],

      lastSyncStatus: "not_started",
      lastSyncError: null,

      disconnectedAt: nowTs(),
      updatedAt: nowTs(),
    },
    { merge: true }
  );

  await batch.commit();

  return {
    ok: true,
    disconnected: true,
  };
}