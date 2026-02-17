// scripts/portalRunner/src/portalCredentials.ts

import type { EncryptOut } from "./shared/cryptoAesGcm";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

import { httpsCallable } from "firebase/functions";
import { initFirebaseClient } from "./firebaseClient";

// ✅ admin (MODULAR) כדי לא ליפול על "default app does not exist"
import { getApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function s(v: any) {
  return String(v ?? "").trim();
}

/**
 * Menora: username + phoneNumber (+ OTP), בלי password קבוע.
 * אחרים: username + password.
 */
export type PortalCreds = {
  username: string;
  password?: string;
  phoneNumber?: string;
  requiresPassword: boolean;
};

function requiresPasswordForPortal(portalId: string): boolean {
  const p = s(portalId).toLowerCase();

  // ✅ בלי סיסמה קבועה:
  if (p === "menora") return false;

  // ✅ עם סיסמה (whitelist מפורש כדי לא לשבור פורטלים עתידיים)
  const PASSWORD_PORTALS = new Set(["migdal", "clal", "fenix"]);
  return PASSWORD_PORTALS.has(p);
}

function ensureAdminApp() {
  try {
    return getApp(); // default
  } catch {
    return initializeApp(); // create default
  }
}

export async function getPortalCreds(params: {
  agentId: string;
  portalId: string;
}): Promise<PortalCreds> {
  const { agentId } = params;
  const portalId = s(params.portalId).toLowerCase(); // ✅ normalize
  const requiresPassword = requiresPasswordForPortal(portalId);

  // ======== SERVER MODE (Cloud Run / admin) ========
  const keyB64 = s(process.env.PORTAL_ENC_KEY_B64);

  // אם יש לנו מפתח הצפנה - ננסה לקרוא ישירות מהשרת (admin)
  if (keyB64) {
    try {
      const app = ensureAdminApp();
      const db = getFirestore(app);

      const docId = `${agentId}_${portalId}`;
      const snap = await db.collection("portalCredentials").doc(docId).get();
      if (!snap.exists) throw new Error(`Missing portalCredentials doc: ${docId}`);

      const data: any = snap.data() || {};
      const enc = data.enc as EncryptOut | undefined;

      if (!enc?.ivB64 || !enc?.tagB64 || !enc?.dataB64) {
        throw new Error(`Invalid enc payload in portalCredentials: ${docId}`);
      }

      const plain = decryptJsonAes256Gcm(keyB64, enc) as any;

      const username = s(plain?.username);
      const password = s(plain?.password);
      const phoneNumber = s(plain?.phoneNumber);

      if (!username) throw new Error(`Decrypted username empty: ${docId}`);
      if (requiresPassword && !password) {
        throw new Error(
          `Decrypted password empty (required) for portalId=${portalId} doc=${docId}`
        );
      }

      return {
        username,
        ...(password ? { password } : {}),
        ...(phoneNumber ? { phoneNumber } : {}),
        requiresPassword,
      };
    } catch (e) {
      // אם זה רץ בלוקאל ואין admin credentials — זה יפול פה,
      // ואז נמשיך ל-client callable (וזה תקין).
    }
  }

  // ======== LOCAL AGENT MODE (client auth + callable) ========
  const { auth, functions } = initFirebaseClient();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated (local runner must login first)");

  if (uid !== agentId) {
    throw new Error("Agent mismatch: local runner uid != run.agentId");
  }

  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId });
  const data = res?.data || {};
  if (!data?.ok) throw new Error("Failed to fetch decrypted credentials");

  const username = s(data.username);
  const password = s(data.password);
  const phoneNumber = s(data.phoneNumber);

  if (!username) throw new Error("Empty username returned from server");
  if (requiresPassword && !password) {
    throw new Error(`Empty password returned from server (required) for portalId=${portalId}`);
  }

  return {
    username,
    ...(password ? { password } : {}),
    ...(phoneNumber ? { phoneNumber } : {}),
    requiresPassword,
  };
}
