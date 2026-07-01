/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";

const ALLOWED_STATUSES = ["pending", "sent", "booked", "declined", "no_response"];

export async function updateReengagementLeadStatusImpl(
  agentId: string,
  surenseId: string,
  status: string
): Promise<object> {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new HttpsError("invalid-argument", `Invalid status: ${status}`);
  }

  const db = adminDb();
  const ref = (db as any).doc(`agents/${agentId}/reengagement_leads/${surenseId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Lead not found");
  }

  const isFinal = status === "booked" || status === "declined" || status === "no_response";

  await ref.update({
    status,
    updatedAt: nowTs(),
    ...(isFinal ? { resolvedAt: nowTs() } : {}),
  });

  return { ok: true, surenseId, status };
}