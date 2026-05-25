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
  licenseNumber?: string;
  loginType?: string;
};

type PortalCredentials = {
  username?: string;
  password?: string;
  phoneNumber?: string;
  licenseNumber?: string;
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
const isMor = portalId === "mor";
const isMeitav = portalId === "meitav";
const isAnalyst = portalId === "analyst";
const isAltshuler = portalId === "altshuler";
const isYalin = portalId === "yalin";
const isInfinity = portalId === "infinity";



const licenseNumber = s((body as any).licenseNumber);

if (isMor) {
  if (!licenseNumber) {
    throw new HttpsError("invalid-argument", "Missing licenseNumber for mor");
  }
  if (!phoneNumber) {
    throw new HttpsError("invalid-argument", "Missing phoneNumber for mor");
  }
} else if (isAltshuler) {
  if (!licenseNumber) {
    throw new HttpsError("invalid-argument", "Missing licenseNumber for altshuler");
  }
} else if (isMenora) {
  if (!phoneNumber) {
    throw new HttpsError("invalid-argument", "Missing phoneNumber for menora");
  }
} else if (isMeitav) {
  if (!phoneNumber) {
    throw new HttpsError("invalid-argument", "Missing phoneNumber for meitav");
  }
} else if (isAnalyst) {
  if (!phoneNumber) {
    throw new HttpsError("invalid-argument", "Missing phoneNumber for analyst");
  }
} else if (isYalin) {
  if (!phoneNumber) {
    throw new HttpsError("invalid-argument", "Missing phoneNumber for yalin");
  }
  } else if (isInfinity) {
  // username בלבד — אין password, אין phoneNumber
} 
else {
  if (!password) {
    throw new HttpsError("invalid-argument", "Missing password");
  }
}
const loginType = s((body as any).loginType);


    const keyB64 = PORTAL_ENC_KEY_B64.value();
    if (!keyB64) throw new HttpsError("internal", "Missing encryption secret value");

const encPayload: PortalCredentials = isMor
  ? {licenseNumber, username, phoneNumber}
  : isAltshuler
    ? {licenseNumber, username, ...(loginType ? {loginType} : {})}
    : isInfinity
      ? {username}
      : (isMenora || isMeitav || isAnalyst || isYalin)
        ? {username, phoneNumber}
        : {username, password};

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
