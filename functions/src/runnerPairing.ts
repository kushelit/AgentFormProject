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

function s(v: any) {
  return String(v ?? "").trim();
}

/**
 * מחזיר את ה-uid שעבורו בפועל ייווצר קוד הצימוד ("מי הבוט יזדהה בתור"),
 * אחרי בדיקת הרשאה בצד השרת.
 *
 * הכלל תואם בדיוק את הלוגיקה הקיימת ב-useFetchAgentData (client):
 * - isSystem === true            → מותר לכל targetAgentId, בלי קשר ל-agencies
 * - role === "admin" (לא system) → מותר רק אם agencies של הקורא == agencies של היעד
 * - אחרת (או אם אין targetAgentId שונה מה-authUid) → מותר רק לעצמו
 */
async function resolvePairingTargetUid(authUid: string, targetAgentId?: string): Promise<string> {
  const target = s(targetAgentId);

  // אין יעד, או שהיעד הוא בדיוק אני → אין צורך בבדיקת הרשאה נוספת
  if (!target || target === authUid) {
    return authUid;
  }

  const db = adminDb();

  const callerSnap = await db.collection("users").doc(authUid).get();
  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Caller profile not found");
  }
  const caller: any = callerSnap.data() || {};

  const isSystem = caller.isSystem === true;
  const callerRole = s(caller.role);
  const callerAgencies = caller.agencies;

  if (isSystem) {
    // System admin - מותר לכל סוכן, בלי תלות ב-agencies.
    // בכל זאת מוודאים שה-uid היעד הוא אכן סוכן/מנהל קיים ופעיל.
    const targetSnap = await db.collection("users").doc(target).get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Target agent not found");
    }
    const targetData: any = targetSnap.data() || {};
    if (targetData.isActive === false) {
      throw new HttpsError("failed-precondition", "Target agent is not active");
    }
    if (!["agent", "manager"].includes(s(targetData.role))) {
      throw new HttpsError("permission-denied", "Target is not an agent/manager");
    }
    return target;
  }

  if (callerRole === "admin") {
    if (!callerAgencies) {
      throw new HttpsError("permission-denied", "Caller has no agencies assigned");
    }

    const targetSnap = await db.collection("users").doc(target).get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Target agent not found");
    }
    const targetData: any = targetSnap.data() || {};

    if (targetData.isActive === false) {
      throw new HttpsError("failed-precondition", "Target agent is not active");
    }
    if (!["agent", "manager"].includes(s(targetData.role))) {
      throw new HttpsError("permission-denied", "Target is not an agent/manager");
    }
    if (targetData.agencies !== callerAgencies) {
      throw new HttpsError("permission-denied", "Target agent is not in caller's agency");
    }

    return target;
  }

  // כל תפקיד אחר - אין הרשאה לפעול בשם סוכן אחר
  throw new HttpsError("permission-denied", "Not authorized to act on behalf of another agent");
}

type CreatePairingInput = {
  targetAgentId?: string;
};

export const createRunnerPairingCode = onCall(async (_req) => {
  const authUid = assertAuthed(_req);

  const body = (_req.data || {}) as Partial<CreatePairingInput>;
  const pairingUid = await resolvePairingTargetUid(authUid, body.targetAgentId);

  // מגבלה פשוטה: עד קוד פתוח אחד לזהות שעבורה נוצר הקוד
  // (לא למי שיצר אותו בפועל - כדי שאדמין לא יינעל אחרי יצירת קוד אחד לסוכן X
  // כשהוא רוצה ליצור עוד קוד לסוכן Y)
  const openSnap = await adminDb()
    .collection("runnerPairings")
    .where("uid", "==", pairingUid)
    .where("status", "==", "open")
    .limit(1)
    .get();

  if (!openSnap.empty) {
    throw new HttpsError("resource-exhausted", "Already have an open pairing code");
  }

  const code = randCode(8);
  const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);

  await adminDb().collection("runnerPairings").doc(code).set({
    uid: pairingUid,
    createdByUid: authUid,
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