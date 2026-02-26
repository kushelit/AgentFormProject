/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {PORTAL_ENC_KEY_B64} from "./shared/secrets";
import {encryptJsonAes256Gcm} from "./shared/cryptoAesGcm";
import {adminDb, nowTs} from "./shared/admin";
import { FUNCTIONS_REGION } from "./shared/region";

type Input = {
  agentId: string;
  portalId: string; // "clal", "migdal", "menora", ...
  username: string;
  password?: string;
  phoneNumber?: string;
};

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
 *
 * Rules:
 * - menora: requires username + phoneNumber, password not required
 * - others: requires username + password
 */
export const savePortalCredentials = onCall(
  {region: FUNCTIONS_REGION , secrets: [PORTAL_ENC_KEY_B64]},
  async (req) => {
    const authUid = req.auth?.uid;
    if (!authUid) throw new HttpsError("unauthenticated", "Login required");

    const body = (req.data || {}) as Partial<Input>;
    const agentId = s(body.agentId);
    const portalId = s(body.portalId).toLowerCase();
    const username = s(body.username);
    const password = s(body.password);
    const phoneNumber = s((body as any).phoneNumber);

    if (!agentId || !portalId || !username) {
      throw new HttpsError("invalid-argument", "Missing agentId/portalId/username");
    }
    if (!isValidPortalId(portalId)) {
      throw new HttpsError("invalid-argument", "Invalid portalId format");
    }

    // only self
    if (authUid !== agentId) {
      throw new HttpsError("permission-denied", "Cannot save credentials for another agent");
    }

    const isMenora = portalId === "menora";

    if (isMenora) {
      if (!phoneNumber) throw new HttpsError("invalid-argument", "Missing phoneNumber for menora");
    } else {
      if (!password) throw new HttpsError("invalid-argument", "Missing password");
    }

    const keyB64 = PORTAL_ENC_KEY_B64.value();
    if (!keyB64) throw new HttpsError("internal", "Missing encryption secret value");

    const encPayload = isMenora ? {username, phoneNumber} : {username, password};
    const enc = encryptJsonAes256Gcm(keyB64, encPayload);

    const db = adminDb();
    const docId = `${agentId}_${portalId}`;
    const ref = db.collection("portalCredentials").doc(docId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = nowTs();

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
