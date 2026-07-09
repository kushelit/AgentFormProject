/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { SURENSE_ACTIVITY_API_KEY } from "./shared/secrets";

function s(v: any): string {
  return String(v ?? "").trim();
}

const DEFAULT_CLOSE_NOTE = "הוחלט שלא להמשיך בטיפול מול לקוח זה";

export async function closeReengagementLeadImpl(
  agentId: string,
  surenseId: string,
  note?: string
): Promise<object> {
  const db = adminDb();
  const ref = (db as any).doc(`agents/${agentId}/reengagement_leads/${surenseId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Lead not found");
  }

  const lead: any = snap.data();
  const surenseWorkflowId = s(lead.surenseWorkflowId);

  let activityWebhookUrl = "";
  try {
    const mainConfigSnap = await (db as any).doc(`agents/${agentId}/config/main`).get();
    if (mainConfigSnap.exists) {
      activityWebhookUrl = s(mainConfigSnap.data()?.surenseActivityWebhookUrl);
    }
  } catch {
    console.warn("[closeReengagementLead] Could not read agent config/main");
  }

  const finalNote = note || DEFAULT_CLOSE_NOTE;
  let surenseSyncedOk = false;

  if (activityWebhookUrl) {
    try {
      const res = await fetch(activityWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-make-apikey": SURENSE_ACTIVITY_API_KEY.value(),
        },
        body: JSON.stringify({
          surenseId,
          fullName: lead.fullName || "",
          surenseWorkflowId: surenseWorkflowId || null,
          surenseWorkflowStatus: "closed",
          activityType: "whatsapp_reengagement_closed",
          activityDate: new Date().toISOString(),
          note: finalNote,
        }),
      });
      surenseSyncedOk = res.ok;
    } catch (e: any) {
      console.error(`[closeReengagementLead] Surense webhook failed for ${surenseId}:`, e.message);
    }
  } else {
    console.warn(`[closeReengagementLead] No surenseActivityWebhookUrl configured for agent ${agentId}`);
  }

  await ref.update({
    status: "declined",
    closedManually: true,
    closeNote: finalNote,
    resolvedAt: nowTs(),
    updatedAt: nowTs(),
    surenseActivitySynced: surenseSyncedOk,
    surenseActivitySyncedAt: surenseSyncedOk ? nowTs() : null,
  });

  return { ok: true, surenseId, surenseSynced: surenseSyncedOk };
}