import admin from "firebase-admin";
import type { EncryptOut } from "./shared/cryptoAesGcm";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

import { httpsCallable } from "firebase/functions";
import { initFirebaseClient } from "./firebaseClient";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function getPortalCreds(params: { agentId: string; portalId: string }) {
  const { agentId, portalId } = params;

  // ======== SERVER MODE (Cloud Run / admin) ========
  const keyB64 = s(process.env.PORTAL_ENC_KEY_B64);
  if (keyB64 && admin.apps.length) {
    const docId = `${agentId}_${portalId}`;
    const snap = await admin.firestore().collection("portalCredentials").doc(docId).get();
    if (!snap.exists) throw new Error(`Missing portalCredentials doc: ${docId}`);

    const data: any = snap.data() || {};
    const enc = data.enc as EncryptOut | undefined;
    if (!enc?.ivB64 || !enc?.tagB64 || !enc?.dataB64) {
      throw new Error(`Invalid enc payload in portalCredentials: ${docId}`);
    }

    const plain = decryptJsonAes256Gcm(keyB64, enc) as { username: string; password: string };
    const username = s(plain?.username);
    const password = s(plain?.password);
    if (!username || !password) throw new Error(`Decrypted creds empty: ${docId}`);

    return { username, password };
  }

  // ======== LOCAL AGENT MODE (client auth + callable) ========
  const { auth, functions } = initFirebaseClient();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated (local runner must login first)");

  if (uid !== agentId) {
    // הגנה נוספת (לא חייב, אבל טוב)
    throw new Error("Agent mismatch: local runner uid != run.agentId");
  }

  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId });
  const data = res?.data || {};
  if (!data?.ok) throw new Error("Failed to fetch decrypted credentials");

  const username = s(data.username);
  const password = s(data.password);
  if (!username || !password) throw new Error("Empty credentials returned from server");

  return { username, password };
}
