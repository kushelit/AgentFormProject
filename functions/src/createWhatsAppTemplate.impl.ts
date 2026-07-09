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

function normalizeTemplateName(v: string) {
  return s(v)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export async function createWhatsAppTemplateImpl(req: any): Promise<object> {
  const authUid = req.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Login required");

  const db = adminDb();

  const userSnap = await (db as any).collection("users").doc(authUid).get();
  if (!userSnap.exists) throw new HttpsError("permission-denied", "User not found");

 const userData = userSnap.data() as any;
const isAdmin = userData?.role === "admin" || userData?.isSystem === true;
const userAgentId = s(userData?.agentId);

const allow = Array.isArray(userData?.permissionOverrides?.allow)
  ? userData.permissionOverrides.allow
  : [];

const hasWhatsAppManagePermission =
  allow.includes("access_whatsapp_manage") ||
  allow.includes("*");

const body = req.data || {};
const agentId = s(body.agentId);

if (!agentId) {
  throw new HttpsError("invalid-argument", "Missing agentId");
}

if (!isAdmin) {
  if (!hasWhatsAppManagePermission) {
    throw new HttpsError("permission-denied", "Missing WhatsApp manage permission");
  }

  if (!userAgentId || userAgentId !== agentId) {
    throw new HttpsError("permission-denied", "Cannot manage WhatsApp templates for another agent");
  }
}
  const rawName = s(body.name);
  const name = normalizeTemplateName(rawName);
  const category = s(body.category || "MARKETING").toUpperCase();
  const language = s(body.language || "he");
  const bodyText = s(body.bodyText);

  if (!agentId || !name || !bodyText) {
    throw new HttpsError("invalid-argument", "Missing agentId / name / bodyText");
  }

  if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) {
    throw new HttpsError("invalid-argument", "Invalid template category");
  }

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

  const payload = {
    name,
    category,
    language,
    components: [
      {
        type: "BODY",
        text: bodyText,
      },
    ],
  };

  const res = await fetch(`${WA_API_URL}/${wabaId}/message_templates`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json: any = await res.json();

  if (!res.ok) {
    console.error("[createWhatsAppTemplate] Meta error:", JSON.stringify(json));
    throw new HttpsError(
      "failed-precondition",
      json?.error?.message || "Failed to create WhatsApp template"
    );
  }

  const metaTemplateId = s(json.id);

  const templateRef = (db as any)
    .collection(`agents/${agentId}/whatsapp_templates`)
    .doc(name);

  await templateRef.set({
    name,
    originalName: rawName,
    category,
    language,
    bodyText,
    metaTemplateId,
    status: s(json.status) || "PENDING",
    provider: "meta_cloud_api",
    createdAt: nowTs(),
    updatedAt: nowTs(),
    createdBy: authUid,
    metaResponse: json,
  }, { merge: true });

  await (db as any).doc(`agents/${agentId}/config/whatsapp`).set({
    lastTemplateCreatedAt: nowTs(),
    updatedAt: nowTs(),
    updatedBy: authUid,
  }, { merge: true });

  return {
    ok: true,
    agentId,
    name,
    category,
    language,
    metaTemplateId,
    status: s(json.status) || "PENDING",
  };
}