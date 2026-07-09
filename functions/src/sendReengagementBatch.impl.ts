/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { PORTAL_ENC_KEY_B64, SURENSE_ACTIVITY_API_KEY } from "./shared/secrets";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

const WA_API_URL = "https://graph.facebook.com/v19.0";
const DEFAULT_TEMPLATE_NAME = "meir_reengagement_initial";

function s(v: any) {
  return String(v ?? "").trim();
}

async function notifySurenseActivity(
  webhookUrl: string,
  surenseId: string,
  fullName: string,
  surenseWorkflowId: string,
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
        surenseWorkflowStatus: "in_progress",
        activityType: "whatsapp_reengagement",
        activityDate: new Date().toISOString(),
        note,
      }),
    });
    return res.ok;
  } catch (e: any) {
    console.error(`[sendReengagementBatch] Surense activity webhook failed for ${surenseId}:`, e.message);
    return false;
  }
}

function templatePreview(templateName: string, bodyText?: string): string {
  if (bodyText) return bodyText;

  if (templateName === "meir_reengagement_initial") {
    return "נשלחה הודעת WhatsApp אוטומטית ליצירת קשר חוזר";
  }

  return `נשלחה תבנית WhatsApp: ${templateName}`;
}

export async function sendReengagementBatchImpl(
  agentId: string,
  leadIds?: string[],
  requestedTemplateName?: string
): Promise<object> {
  const db = adminDb();

  const waConfigSnap = await (db as any).doc(`agents/${agentId}/config/whatsapp`).get();
  if (!waConfigSnap.exists) {
    throw new HttpsError("failed-precondition", "WhatsApp config not found for agent");
  }

  const waConfig = waConfigSnap.data() as any;
  const phoneNumberId = s(waConfig.phoneNumberId);
  const templateName = s(requestedTemplateName) || s(waConfig.templateName) || DEFAULT_TEMPLATE_NAME;

  if (!phoneNumberId) {
    throw new HttpsError("failed-precondition", "Missing phoneNumberId for agent");
  }

  if (!templateName) {
    throw new HttpsError("invalid-argument", "Missing templateName");
  }

  let templateLanguage = "he";
  let templateBodyText = "";

  const templateSnap = await (db as any)
    .doc(`agents/${agentId}/whatsapp_templates/${templateName}`)
    .get();

  if (requestedTemplateName) {
    if (!templateSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Selected WhatsApp template was not found for this agent"
      );
    }

    const templateData = templateSnap.data() as any;
    const templateStatus = s(templateData.status).toUpperCase();

    if (templateStatus !== "APPROVED") {
      throw new HttpsError(
        "failed-precondition",
        `Selected WhatsApp template is not approved. Current status: ${templateStatus || "UNKNOWN"}`
      );
    }

    templateLanguage = s(templateData.language) || "he";
    templateBodyText = s(templateData.bodyText);
  } else if (templateSnap.exists) {
    const templateData = templateSnap.data() as any;
    templateLanguage = s(templateData.language) || "he";
    templateBodyText = s(templateData.bodyText);
  }

  const waSecretSnap = await (db as any)
    .doc(`agents/${agentId}/secrets/whatsapp`)
    .get();

  if (!waSecretSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp token not configured for agent"
    );
  }

  const keyB64 = PORTAL_ENC_KEY_B64.value();
  if (!keyB64) throw new HttpsError("internal", "Missing encryption key");

  const waSecret = waSecretSnap.data() as any;

  const { accessToken } = decryptJsonAes256Gcm(
    keyB64,
    waSecret.enc
  ) as any;

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid WhatsApp token for agent"
    );
  }

  let activityWebhookUrl = "";
  let batchSize = 20;
  try {
    const mainConfigSnap = await (db as any).doc(`agents/${agentId}/config/main`).get();
    if (mainConfigSnap.exists) {
      const mainConfig = mainConfigSnap.data() as any;
      activityWebhookUrl = s(mainConfig.surenseActivityWebhookUrl);
      batchSize = mainConfig.waBatchSize ?? 20;
    }
  } catch {
    console.warn("[sendReengagementBatch] Could not read agent config/main");
  }

  if (!activityWebhookUrl) {
    console.warn(`[sendReengagementBatch] No surenseActivityWebhookUrl configured for agent ${agentId} - Surense will NOT be updated`);
  }

  let leadDocs: FirebaseFirestore.DocumentSnapshot[];

  if (leadIds && leadIds.length > 0) {
    const refs = leadIds.map((id) => (db as any).doc(`agents/${agentId}/reengagement_leads/${id}`));
    const snaps = await (db as any).getAll(...refs);
    leadDocs = snaps.filter((snap: any) => snap.exists && snap.data()?.status === "pending");

    if (leadDocs.length === 0) {
      return { ok: true, sent: 0, message: "No valid pending leads in selection" };
    }
  } else {
    const leadsSnap = await (db as any)
      .collection(`agents/${agentId}/reengagement_leads`)
      .where("status", "==", "pending")
      .limit(batchSize)
      .get();

    if (leadsSnap.empty) {
      return { ok: true, sent: 0, message: "No pending leads" };
    }
    leadDocs = leadsSnap.docs;
  }

  const batchId = `batch_${Date.now()}`;
  let sent = 0;
  let failed = 0;
  let surenseSynced = 0;
  let surenseSyncFailed = 0;
  const errors: any[] = [];

  for (const doc of leadDocs) {
    const lead: any = doc.data();
    const phone = lead.phone as string;

    if (!phone) {
      console.warn(`[sendReengagementBatch] Lead ${doc.id} has no phone, skipping`);
      failed++;
      continue;
    }

    const normalizedPhone = normalizeIsraeliPhone(phone);
    if (!normalizedPhone) {
      console.warn(`[sendReengagementBatch] Invalid phone for ${doc.id}: ${phone}`);
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
            name: templateName,
            language: { code: templateLanguage },
          },
        }),
      });

      const waData = await waRes.json() as any;
      const waMessageId = waData?.messages?.[0]?.id ?? null;

      if (!waRes.ok) {
        console.error(`[sendReengagementBatch] WA error for ${doc.id}:`, JSON.stringify(waData));
        errors.push({ surenseId: doc.id, error: waData });
        failed++;
        continue;
      }

      let surenseSyncedOk = false;
      if (activityWebhookUrl) {
        surenseSyncedOk = await notifySurenseActivity(
          activityWebhookUrl,
          doc.id,
          lead.fullName || "",
          s(lead.surenseWorkflowId),
          "נשלחה הודעת WhatsApp אוטומטית ליצירת קשר חוזר"
        );
        if (surenseSyncedOk) surenseSynced++;
        else surenseSyncFailed++;
      } else {
        surenseSyncFailed++;
      }

      const conversationId = `${agentId}_${normalizedPhone}`;
      const messagePreview = templatePreview(templateName, templateBodyText);

      const conversationRef = (db as any).doc(`whatsapp_conversations/${conversationId}`);
      const conversationMessageRef = conversationRef
        .collection("messages")
        .doc(waMessageId || `outbound_${Date.now()}`);

      await conversationRef.set({
        agentId,
        phoneNumberId,
        customerPhone: normalizedPhone,
        customerName: lead.fullName || null,
        leadId: doc.id,
        status: "open",
        lastMessageText: messagePreview,
        lastMessageType: "template",
        lastMessageDirection: "outbound",
        lastMessageAt: nowTs(),
        updatedAt: nowTs(),
      }, { merge: true });

      await conversationMessageRef.set({
        direction: "outbound",
        fromPhoneNumberId: phoneNumberId,
        to: normalizedPhone,
        type: "template",
        templateName,
        templateLanguage,
        text: messagePreview,
        waMessageId,
        status: "accepted",
        createdAt: nowTs(),
      }, { merge: true });

      await doc.ref.update({
        status: "accepted",
        waMessageId,
        waAcceptedAt: nowTs(),
        batchId,
        conversationId,
        templateName,
        updatedAt: nowTs(),
        surenseActivitySynced: surenseSyncedOk,
        surenseActivitySyncedAt: surenseSyncedOk ? nowTs() : null,
      });

      sent++;
      console.info(`[sendReengagementBatch] Sent to ${doc.id} (${normalizedPhone}), templateName=${templateName}, surenseSynced=${surenseSyncedOk}`);
    } catch (e: any) {
      console.error(`[sendReengagementBatch] Error for ${doc.id}:`, e.message);
      errors.push({ surenseId: doc.id, error: e.message });
      failed++;
    }
  }

  return {
    ok: true,
    batchId,
    sent,
    failed,
    surenseSynced,
    surenseSyncFailed,
    templateName,
    errors,
  };
}

function normalizeIsraeliPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "972" + digits.slice(1);
  if (digits.length === 9) return "972" + digits;
  return null;
}