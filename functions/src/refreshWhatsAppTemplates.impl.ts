/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

const WA_API_URL = "https://graph.facebook.com/v25.0";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function refreshWhatsAppTemplatesImpl(req: any): Promise<object> {
  const authUid = req.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Login required");

  const db = adminDb();

  const userSnap = await (db as any).collection("users").doc(authUid).get();
  if (!userSnap.exists) throw new HttpsError("permission-denied", "User not found");

  const userData = userSnap.data() as any;
  const isAdmin = userData?.role === "admin" || userData?.isSystem === true;
  if (!isAdmin) throw new HttpsError("permission-denied", "Admin only");

  const agentId = s(req.data?.agentId);
  if (!agentId) throw new HttpsError("invalid-argument", "Missing agentId");

  const waConfigSnap = await (db as any).doc(`agents/${agentId}/config/whatsapp`).get();
  if (!waConfigSnap.exists) {
    throw new HttpsError("failed-precondition", "WhatsApp config not found for agent");
  }

  const waConfig = waConfigSnap.data() as any;
  const wabaId = s(waConfig.wabaId);

  if (!wabaId) {
    throw new HttpsError("failed-precondition", "Missing wabaId for agent");
  }

  const waSecretSnap = await (db as any).doc(`agents/${agentId}/secrets/whatsapp`).get();
  if (!waSecretSnap.exists) {
    throw new HttpsError("failed-precondition", "WhatsApp token not configured for agent");
  }

  const keyB64 = PORTAL_ENC_KEY_B64.value();
  if (!keyB64) throw new HttpsError("internal", "Missing encryption key");

  const waSecret = waSecretSnap.data() as any;
  const { accessToken } = decryptJsonAes256Gcm(keyB64, waSecret.enc) as any;

  if (!accessToken) {
    throw new HttpsError("failed-precondition", "Invalid WhatsApp token for agent");
  }

  const fields = [
    "id",
    "name",
    "status",
    "category",
    "language",
    "components",
  ].join(",");

  const res = await fetch(
    `${WA_API_URL}/${wabaId}/message_templates?fields=${encodeURIComponent(fields)}&limit=100`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    }
  );

  const json: any = await res.json();

  if (!res.ok) {
    console.error("[refreshWhatsAppTemplates] Meta error:", JSON.stringify(json));
    throw new HttpsError(
      "failed-precondition",
      json?.error?.message || "Failed to refresh WhatsApp templates"
    );
  }

  const templates: any[] = Array.isArray(json?.data) ? json.data : [];
  const batch = (db as any).batch();

  for (const t of templates) {
    const name = s(t.name);
    if (!name) continue;

    const bodyComponent = Array.isArray(t.components)
      ? t.components.find((c: any) => String(c?.type || "").toUpperCase() === "BODY")
      : null;

    const templateRef = (db as any)
      .collection(`agents/${agentId}/whatsapp_templates`)
      .doc(name);

    batch.set(templateRef, {
      name,
      metaTemplateId: s(t.id),
      category: s(t.category),
      language: s(t.language),
      status: s(t.status) || "UNKNOWN",
      bodyText: s(bodyComponent?.text),
      components: t.components || [],
      provider: "meta_cloud_api",
      syncedAt: nowTs(),
      updatedAt: nowTs(),
      syncedBy: authUid,
      metaResponse: t,
    }, { merge: true });
  }

  await batch.commit();

  await (db as any).doc(`agents/${agentId}/config/whatsapp`).set({
    lastTemplatesSyncedAt: nowTs(),
    updatedAt: nowTs(),
    updatedBy: authUid,
  }, { merge: true });

  return {
    ok: true,
    agentId,
    wabaId,
    count: templates.length,
  };
}
