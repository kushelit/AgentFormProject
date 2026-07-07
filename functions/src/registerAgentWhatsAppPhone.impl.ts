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

export async function registerAgentWhatsAppPhoneImpl(req: any): Promise<object> {
  const authUid = req.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Login required");

  const db = adminDb();

  const userSnap = await (db as any).collection("users").doc(authUid).get();
  if (!userSnap.exists) throw new HttpsError("permission-denied", "User not found");

  const userData = userSnap.data() as any;
  const isAdmin = userData?.role === "admin" || userData?.isSystem === true;
  if (!isAdmin) throw new HttpsError("permission-denied", "Admin only");

  const agentId = s(req.data?.agentId);
  const pin = s(req.data?.pin);

  if (!agentId) throw new HttpsError("invalid-argument", "Missing agentId");
  if (!pin) throw new HttpsError("invalid-argument", "Missing pin");

  const configSnap = await (db as any).doc(`agents/${agentId}/config/whatsapp`).get();
  if (!configSnap.exists) {
    throw new HttpsError("failed-precondition", "WhatsApp config not found for agent");
  }

  const config = configSnap.data() as any;
  const phoneNumberId = s(config.phoneNumberId);

  if (!phoneNumberId) {
    throw new HttpsError("failed-precondition", "Missing phoneNumberId");
  }

  const secretSnap = await (db as any).doc(`agents/${agentId}/secrets/whatsapp`).get();
  if (!secretSnap.exists) {
    throw new HttpsError("failed-precondition", "WhatsApp secret not found for agent");
  }

  const keyB64 = PORTAL_ENC_KEY_B64.value();
  if (!keyB64) throw new HttpsError("internal", "Missing encryption key");

  const { accessToken } = decryptJsonAes256Gcm(
    keyB64,
    (secretSnap.data() as any).enc
  ) as any;

  if (!accessToken) {
    throw new HttpsError("failed-precondition", "Invalid WhatsApp token");
  }

  const res = await fetch(`${WA_API_URL}/${phoneNumberId}/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      pin,
    }),
  });

  const json: any = await res.json();

  if (!res.ok) {
    console.error("[registerAgentWhatsAppPhone] Meta error:", JSON.stringify(json));
    throw new HttpsError(
      "failed-precondition",
      json?.error?.message || "Failed to register WhatsApp phone number"
    );
  }

  await (db as any).doc(`agents/${agentId}/config/whatsapp`).set({
    phoneRegisteredAt: nowTs(),
    status: "registered",
    updatedAt: nowTs(),
    updatedBy: authUid,
  }, { merge: true });

  return {
    ok: true,
    agentId,
    phoneNumberId,
    meta: json,
  };
}