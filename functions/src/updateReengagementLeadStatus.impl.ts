/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { SURENSE_ACTIVITY_API_KEY } from "./shared/secrets";

const ALLOWED_STATUSES = [
  "pending",
  "sent",
  "interested",
  "booked",
  "declined",
  "no_response",
];

// כרגע רק "declined" שולח עדכון לשורנס וסוגר את התהליך שם.
// "booked" ו-"no_response" נשארים ללא שינוי בשורנס - יפותח בהמשך.
const SURENSE_SYNCED_STATUSES = ["declined"];

function s(v: any): string {
  return String(v ?? "").trim();
}

const STATUS_NOTES: Record<string, string> = {
  declined: "הלקוח סירב להצעה בעקבות פניית WhatsApp אוטומטית",
};

async function notifySurenseActivity(
  webhookUrl: string,
  surenseId: string,
  fullName: string,
  surenseWorkflowId: string,
  activityType: string,
  note: string
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-make-apikey": SURENSE_ACTIVITY_API_KEY.value(),
      },
      body: JSON.stringify({
        surenseId,
        fullName,
        surenseWorkflowId: surenseWorkflowId || null,
        surenseWorkflowStatus: "closed",
        activityType,
        activityDate: new Date().toISOString(),
        note,
      }),
    });

    return res.ok;
  } catch (e: any) {
    console.error(
      `[updateReengagementLeadStatus] Surense webhook failed for ${surenseId}:`,
      e.message
    );

    return false;
  }
}

export async function updateReengagementLeadStatusImpl(
  agentId: string,
  surenseId: string,
  status: string
): Promise<object> {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid status: ${status}`
    );
  }

  const db = adminDb();

  const ref = (db as any).doc(
    `agents/${agentId}/reengagement_leads/${surenseId}`
  );

  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Lead not found");
  }

  const lead: any = snap.data();

  const isFinal =
    status === "booked" ||
    status === "declined" ||
    status === "no_response";

  const shouldSyncToSurense =
    SURENSE_SYNCED_STATUSES.includes(status);

  let surenseSyncedOk = false;

  if (shouldSyncToSurense) {
    let activityWebhookUrl = "";

    try {
      const mainConfigSnap = await (db as any)
        .doc(`agents/${agentId}/config/main`)
        .get();

      if (mainConfigSnap.exists) {
        activityWebhookUrl = s(
          mainConfigSnap.data()?.surenseActivityWebhookUrl
        );
      }
    } catch {
      console.warn(
        "[updateReengagementLeadStatus] Could not read agent config/main"
      );
    }

    if (activityWebhookUrl) {
      surenseSyncedOk = await notifySurenseActivity(
        activityWebhookUrl,
        surenseId,
        lead.fullName || "",
        s(lead.surenseWorkflowId),
        `whatsapp_reengagement_${status}`,
        STATUS_NOTES[status] || `סטטוס עודכן ל-${status}`
      );
    } else {
      console.warn(
        `[updateReengagementLeadStatus] No surenseActivityWebhookUrl configured for agent ${agentId}`
      );
    }
  }

  const statusFields: Record<string, Record<string, any>> = {
    pending: {
      interestStatus: "pending",
      bookingStatus: "not_sent",
    },

    sent: {
      interestStatus: "pending",
    },

    interested: {
      interestStatus: "interested",
      interestRespondedAt: nowTs(),
      bookingStatus: "not_sent",
    },

    declined: {
      interestStatus: "not_interested",
      interestRespondedAt: nowTs(),
      bookingStatus: "not_sent",
    },

    booked: {
      bookingStatus: "booked",
      bookedAt: nowTs(),
    },

    no_response: {
      interestStatus: "pending",
      bookingStatus: "no_booking",
    },
  };

  await ref.update({
    status,
    ...statusFields[status],
    updatedAt: nowTs(),

    ...(isFinal
      ? {
          resolvedAt: nowTs(),
        }
      : {}),

    ...(shouldSyncToSurense
      ? {
          surenseActivitySynced: surenseSyncedOk,
          surenseActivitySyncedAt: surenseSyncedOk
            ? nowTs()
            : null,
        }
      : {}),
  });

  return {
    ok: true,
    surenseId,
    status,
    surenseSynced: surenseSyncedOk,
  };
}