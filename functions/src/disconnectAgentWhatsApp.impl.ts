/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {HttpsError} from "firebase-functions/v2/https";
import {adminDb, nowTs} from "./shared/admin";

/*
 * ניתוק WhatsApp בתוך MagicTouch בלבד.
 *
 * לא נוגעים ב-Meta: לא מבטלים רישום של המספר ולא מנתקים את ה-WABA מהאפליקציה.
 * לטסט ולייצור יש אותה אפליקציית Meta ואותם מספרים, ולכן ניתוק אצל Meta
 * היה שובר את המספר גם בסביבה השנייה.
 *
 * מה כן קורה:
 * 1. config/whatsapp מסומן "disconnected".
 * 2. המיפוי whatsapp_phone_mappings/{phoneNumberId} נמחק, רק אם הוא שייך לסוכן הזה,
 *    כך שהודעות נכנסות כבר לא מנותבות אליו.
 * 3. הטוקן ב-secrets/whatsapp נמחק.
 *
 * הרשאה: הסוכן עצמו או isSystem, כמו isTouchOwner בחוקי Firestore.
 */

function s(value: unknown): string {
  return String(value ?? "").trim();
}

export async function disconnectAgentWhatsAppImpl(
  req: any
): Promise<object> {
  const authUid = s(req.auth?.uid);

  if (!authUid) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const agentId = s(req.data?.agentId) || authUid;

  if (agentId.includes("/")) {
    throw new HttpsError("invalid-argument", "Invalid agentId");
  }

  const db = adminDb() as any;

  const userSnap = await db.collection("users").doc(authUid).get();

  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "User not found");
  }

  const isSystem = userSnap.data()?.isSystem === true;

  if (!isSystem && authUid !== agentId) {
    throw new HttpsError(
      "permission-denied",
      "רק הסוכן עצמו יכול לנתק את חיבור ה-WhatsApp."
    );
  }

  const configRef = db.doc(`agents/${agentId}/config/whatsapp`);
  const secretRef = db.doc(`agents/${agentId}/secrets/whatsapp`);

  const configSnap = await configRef.get();

  if (!configSnap.exists) {
    throw new HttpsError("not-found", "לא נמצא חיבור WhatsApp לסוכן.");
  }

  const phoneNumberId = s(configSnap.data()?.phoneNumberId);

  const batch = db.batch();

  let mappingRemoved = false;

  if (phoneNumberId && !phoneNumberId.includes("/")) {
    const mappingRef = db.doc(`whatsapp_phone_mappings/${phoneNumberId}`);
    const mappingSnap = await mappingRef.get();

    // לא מוחקים מיפוי שעבר בינתיים לסוכן אחר
    if (mappingSnap.exists && s(mappingSnap.data()?.agentId) === agentId) {
      batch.delete(mappingRef);
      mappingRemoved = true;
    }
  }

  batch.delete(secretRef);

  batch.set(
    configRef,
    {
      status: "disconnected",
      phoneRegistered: false,
      webhookSubscribed: false,
      disconnectedAt: nowTs(),
      disconnectedBy: authUid,
      updatedAt: nowTs(),
      updatedBy: authUid,
    },
    {merge: true}
  );

  await batch.commit();

  console.info("[disconnectAgentWhatsApp] Disconnected", {
    agentId,
    phoneNumberId: phoneNumberId || null,
    mappingRemoved,
    byUid: authUid,
  });

  return {
    ok: true,
    disconnected: true,
    phoneNumberId: phoneNumberId || null,
    mappingRemoved,
  };
}
