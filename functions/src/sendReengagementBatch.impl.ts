/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminDb, nowTs } from "./shared/admin";
import { HttpsError } from "firebase-functions/v2/https";

const WA_API_URL = "https://graph.facebook.com/v19.0";

export async function sendReengagementBatchImpl(agentId: string): Promise<object> {
  const accessToken = process.env.WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new HttpsError("internal", "Missing WA configuration");
  }

  const db = adminDb();

  // קח batchSize מה-config של הסוכן
  let batchSize = 20;
  try {
    const configSnap = await (db as any).doc(`agents/${agentId}/config/main`).get();
    if (configSnap.exists) {
      batchSize = configSnap.data()?.waBatchSize ?? 20;
    }
  } catch {
    console.warn("[sendReengagementBatch] Could not read agent config, using default batchSize=20");
  }

  // שלוף לידים עם סטטוס pending
  const leadsSnap = await (db as any)
    .collection(`agents/${agentId}/reengagement_leads`)
    .where("status", "==", "pending")
    .limit(batchSize)
    .get();

  if (leadsSnap.empty) {
    return { ok: true, sent: 0, message: "No pending leads" };
  }

  const batchId = `batch_${Date.now()}`;
  let sent = 0;
  let failed = 0;
  const errors: any[] = [];

  for (const doc of leadsSnap.docs) {
    const lead = doc.data();
    const phone = lead.phone as string;

    if (!phone) {
      console.warn(`[sendReengagementBatch] Lead ${doc.id} has no phone, skipping`);
      failed++;
      continue;
    }

    const normalizedPhone = normalizeIsraeliPhone(phone);
    if (!normalizedPhone) {
      console.warn(`[sendReengagementBatch] Invalid phone for lead ${doc.id}: ${phone}`);
      failed++;
      continue;
    }

    try {
      const waRes = await fetch(`${WA_API_URL}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizedPhone,
          type: "template",
          template: {
            name: "unamix_test",
            language: { code: "en" },
          },
        }),
      });

      const waData = await waRes.json() as any;

      if (!waRes.ok) {
        console.error(`[sendReengagementBatch] WA error for ${doc.id}:`, JSON.stringify(waData));
        errors.push({ surenseId: doc.id, error: waData });
        failed++;
        continue;
      }

      await doc.ref.update({
        status: "sent",
        batchId,
        waSentAt: nowTs(),
        updatedAt: nowTs(),
      });

      sent++;
      console.info(`[sendReengagementBatch] Sent to ${doc.id} (${normalizedPhone})`);

    } catch (e: any) {
      console.error(`[sendReengagementBatch] Error for ${doc.id}:`, e.message);
      errors.push({ surenseId: doc.id, error: e.message });
      failed++;
    }
  }

  return { ok: true, batchId, sent, failed, errors };
}

function normalizeIsraeliPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "972" + digits.slice(1);
  if (digits.length === 9) return "972" + digits;
  return null;
}