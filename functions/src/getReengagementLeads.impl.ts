/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminDb } from "./shared/admin";

export async function getReengagementLeadsImpl(agentId: string): Promise<object> {
  const db = adminDb();

  const snap = await (db as any)
    .collection(`agents/${agentId}/reengagement_leads`)
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();

  const leads = snap.docs.map((doc: any) => {
    const data = doc.data();
    return {
      surenseId: doc.id,
      fullName: data.fullName || "",
      phone: data.phone || "",
      lastActivityDate: data.lastActivityDate || "",
      status: data.status || "pending",
      waSentAt: data.waSentAt ? data.waSentAt.toMillis() : null,
      updatedAt: data.updatedAt ? data.updatedAt.toMillis() : null,
    };
  });

  const stats: Record<string, number> = {
    pending: 0,
    sent: 0,
    booked: 0,
    declined: 0,
    no_response: 0,
  };
  for (const lead of leads) {
    stats[lead.status] = (stats[lead.status] || 0) + 1;
  }

  return { ok: true, leads, stats };
}