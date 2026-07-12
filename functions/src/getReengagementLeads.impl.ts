/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminDb } from "./shared/admin";

function toMillisOrNull(value: any): number | null {
  if (!value) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed)
    ? null
    : parsed;
}

export async function getReengagementLeadsImpl(
  agentId: string
): Promise<object> {
  const db = adminDb();

  const snap = await (db as any)
    .collection(
      `agents/${agentId}/reengagement_leads`
    )
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();

  const leads = snap.docs.map((doc: any) => {
    const data = doc.data();

    return {
      surenseId: doc.id,

      fullName:
        data.fullName || "",

      phone:
        data.phone || "",

      lastActivityDate:
        data.lastActivityDate || "",

      status:
        data.status || "pending",

      waSentAt:
        toMillisOrNull(data.waSentAt),

      updatedAt:
        toMillisOrNull(data.updatedAt),

      surenseStatusName:
        data.surenseStatusName || null,

      surenseStatusActive:
        typeof data.surenseStatusActive === "boolean"
          ? data.surenseStatusActive
          : null,

      surenseWorkflowId:
        data.surenseWorkflowId || null,

      interestStatus:
        data.interestStatus || "pending",

      bookingStatus:
        data.bookingStatus || "not_sent",

      bookingLinkSentAt:
        toMillisOrNull(data.bookingLinkSentAt),

      interestRespondedAt:
        toMillisOrNull(data.interestRespondedAt),
    };
  });

  const stats: Record<string, number> = {
    pending: 0,
    sent: 0,
    accepted: 0,
    delivered: 0,
    read: 0,
    interested: 0,
    booked: 0,
    declined: 0,
    no_response: 0,
    failed: 0,
  };

  for (const lead of leads) {
    const status = String(
      lead.status || "pending"
    );

    stats[status] =
      (stats[status] || 0) + 1;
  }

  return {
    ok: true,
    leads,
    stats,
  };
}