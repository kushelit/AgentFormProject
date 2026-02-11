/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {PORTAL_ENC_KEY_B64} from "./shared/secrets";
import {encryptJsonAes256Gcm} from "./shared/cryptoAesGcm";

type Input = {
  agentId: string;
  portalId: string; // "clal", "migdal", ...
  username: string;
  password: string;
};

function ensureAdmin() {
  if (!admin.apps.length) admin.initializeApp();
  return admin;
}

function s(v: any) {
  return String(v ?? "").trim();
}

function isValidPortalId(portalId: string) {
  return /^[a-z0-9_]{2,40}$/i.test(portalId);
}

function maskUser(u: string) {
  const x = s(u);
  if (!x) return "";
  if (x.length <= 2) return "**";
  return `${x.slice(0, 2)}***`;
}

/**
 * savePortalCredentials
 * Firestore: portalCredentials/{agentId}_{portalId}
 */
export const savePortalCredentials = onCall(
  {region: "us-central1", secrets: [PORTAL_ENC_KEY_B64]},
  async (req) => {
    const adminApp = ensureAdmin();
    const db = adminApp.firestore();

    const authUid = req.auth?.uid;
    if (!authUid) throw new HttpsError("unauthenticated", "Login required");

    const body = (req.data || {}) as Partial<Input>;
    const agentId = s(body.agentId);
    const portalId = s(body.portalId);
    const username = s(body.username);
    const password = s(body.password);

    if (!agentId || !portalId || !username || !password) {
      throw new HttpsError("invalid-argument", "Missing agentId/portalId/username/password");
    }
    if (!isValidPortalId(portalId)) {
      throw new HttpsError("invalid-argument", "Invalid portalId format");
    }

    // הרשאה בסיסית: רק המשתמש עצמו
    if (authUid !== agentId) {
      throw new HttpsError("permission-denied", "Cannot save credentials for another agent");
    }

    const keyB64 = PORTAL_ENC_KEY_B64.value();
    if (!keyB64) throw new HttpsError("internal", "Missing encryption secret value");

    const enc = encryptJsonAes256Gcm(keyB64, {username, password});

    const docId = `${agentId}_${portalId}`;
    const ref = db.collection("portalCredentials").doc(docId);

    // לא לדרוס createdAt כל פעם
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = adminApp.firestore.FieldValue.serverTimestamp();

      const base: any = {
        agentId,
        portalId,
        usernameMasked: maskUser(username),
        enc,
        alg: enc.alg,
        updatedAt: now,
        updatedBy: {uid: authUid},
      };

      if (!snap.exists) {
        base.createdAt = now;
        base.createdBy = {uid: authUid};
      }

      tx.set(ref, base, {merge: true});
    });

    return {ok: true, docId};
  }
);
