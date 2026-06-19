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
  const templateName = s(body.templateName);
  const accessToken = s(body.accessToken); // אופציונלי - רק כשרוצים לעדכן את הטוקן הגלובלי

  if (!agentId || !phoneNumberId) {
    throw new HttpsError("invalid-argument", "Missing agentId / phoneNumberId");
  }

  const keyB64 = PORTAL_ENC_KEY_B64.value();
  if (!keyB64) throw new HttpsError("internal", "Missing encryption key");

  // אם הוזן טוקן - מעדכן את המסמך הגלובלי המשותף לכל הסוכנים
  if (accessToken) {
    const enc = encryptJsonAes256Gcm(keyB64, { accessToken });
    await (db as any).doc("system/whatsappConfig").set({
      enc,
      updatedAt: nowTs(),
      updatedBy: authUid,
    });
    console.info(`[saveAgentWhatsAppConfig] Global token updated by ${authUid}`);
  }

  // הגדרות ספציפיות לסוכן - בלי טוקן בכלל
  const agentDocData: any = {
    phoneNumberId,
    updatedAt: nowTs(),
    updatedBy: authUid,
  };
  if (templateName) agentDocData.templateName = templateName;

  await (db as any).doc(`agents/${agentId}/config/whatsapp`).set(agentDocData, { merge: true });

  return { ok: true, globalTokenUpdated: !!accessToken };
}