/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";
import { encryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function saveAgentWhatsAppConfigImpl(req: any): Promise<object> {
  const authUid = req.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Login required");

  const db = adminDb();
  const userSnap = await (db as any).collection("users").doc(authUid).get();
  if (!userSnap.exists) throw new HttpsError("permission-denied", "User not found");

  const userData = userSnap.data() as any;
  const isAdmin = userData?.role === "admin" || userData?.isSystem === true;
  if (!isAdmin) throw new HttpsError("permission-denied", "Admin only");

  const body = req.data || {};
  const agentId = s(body.agentId);
  const phoneNumberId = s(body.phoneNumberId);
  const accessToken = s(body.accessToken);

  if (!agentId || !phoneNumberId || !accessToken) {
    throw new HttpsError("invalid-argument", "Missing agentId / phoneNumberId / accessToken");
  }

  const keyB64 = PORTAL_ENC_KEY_B64.value();
  if (!keyB64) throw new HttpsError("internal", "Missing encryption key");

  const enc = encryptJsonAes256Gcm(keyB64, { accessToken });

  await (db as any).doc(`agents/${agentId}/config/whatsapp`).set({
    phoneNumberId,
    enc,
    updatedAt: nowTs(),
    updatedBy: authUid,
  });

  return { ok: true };
}