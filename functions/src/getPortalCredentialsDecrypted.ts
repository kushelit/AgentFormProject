/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {PORTAL_ENC_KEY_B64} from "./shared/secrets";
import {decryptJsonAes256Gcm, type EncryptOut} from "./shared/cryptoAesGcm";
import {adminDb} from "./shared/admin";

type Input = {
  portalId: string;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function isValidPortalId(portalId: string) {
  return /^[a-z0-9_]{2,40}$/i.test(portalId);
}

/**
 * getPortalCredentialsDecrypted
 * Callable: returns {username,password} for the *logged in* agent only.
 */
export const getPortalCredentialsDecrypted = onCall(
  {region: "us-central1", secrets: [PORTAL_ENC_KEY_B64]},
  async (req) => {
    const authUid = req.auth?.uid;
    if (!authUid) throw new HttpsError("unauthenticated", "Login required");

    const body = (req.data || {}) as Partial<Input>;
    const portalId = s(body.portalId);
    if (!portalId || !isValidPortalId(portalId)) {
      throw new HttpsError("invalid-argument", "Invalid portalId");
    }

    const keyB64 = PORTAL_ENC_KEY_B64.value();
    if (!keyB64) throw new HttpsError("internal", "Missing encryption secret value");

    const db = adminDb();
    const docId = `${authUid}_${portalId}`;
    const snap = await db.collection("portalCredentials").doc(docId).get();
    if (!snap.exists) {
      throw new HttpsError("failed-precondition", `Missing portal credentials for ${portalId}`);
    }

    const data: any = snap.data() || {};
    const enc = data.enc as EncryptOut | undefined;
    if (!enc?.ivB64 || !enc?.tagB64 || !enc?.dataB64) {
      throw new HttpsError("internal", "Invalid enc payload");
    }

    const plain = decryptJsonAes256Gcm(keyB64, enc) as { username: string; password: string };
    const username = s(plain?.username);
    const password = s(plain?.password);
    if (!username || !password) throw new HttpsError("internal", "Decrypted creds empty");

    return {ok: true, username, password};
  }
);
