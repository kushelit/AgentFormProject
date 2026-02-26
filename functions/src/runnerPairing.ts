// functions/src/runnerPairing.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import { FUNCTIONS_REGION } from "./shared/region";
import { adminDb } from "./shared/admin";

// חשוב: זה מגדיר region ברירת מחדל לכל הפונקציות בקובץ הזה
setGlobalOptions({ region: FUNCTIONS_REGION });

function randCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // בלי 0,O,1,I
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function assertAuthed(context: any) {
  const uid = context.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be authenticated");
  return uid as string;
}

export const createRunnerPairingCode = onCall(async (_req) => {
  const uid = assertAuthed(_req);

  // מגבלה פשוטה: עד 1 קוד פתוח למשתמש
  const openSnap = await adminDb()
    .collection("runnerPairings")
    .where("uid", "==", uid)
    .where("status", "==", "open")
    .limit(1)
    .get();

  if (!openSnap.empty) {
    throw new HttpsError("resource-exhausted", "Already have an open pairing code");
  }

  const code = randCode(8);
  const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);

  await adminDb().collection("runnerPairings").doc(code).set({
    uid,
    status: "open",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  return { code, expiresAtMs: expiresAt.toMillis() };
});

export const consumeRunnerPairingCode = onCall(async (req) => {
  const code = String(req.data?.code || "").trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Missing code");

  const ref = adminDb().collection("runnerPairings").doc(code);

  const uid = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Invalid code");

    const v: any = snap.data();
    if (v.status !== "open") {
      throw new HttpsError("failed-precondition", "Code already used");
    }

    const expiresAt: any = v.expiresAt;
    if (!expiresAt?.toMillis || expiresAt.toMillis() < Date.now()) {
      tx.update(ref, { status: "expired", expiredAt: FieldValue.serverTimestamp() });
      throw new HttpsError("deadline-exceeded", "Code expired");
    }

    tx.update(ref, {
      status: "used",
      usedAt: FieldValue.serverTimestamp(),
    });

    return String(v.uid || "");
  });

  if (!uid) throw new HttpsError("internal", "Missing uid on pairing");

  const customToken = await getAuth().createCustomToken(uid);
  return { customToken };
});