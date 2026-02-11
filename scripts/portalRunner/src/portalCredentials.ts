// scripts/portalRunner/src/portalCredentials.ts
import admin from "firebase-admin";
import type { EncryptOut } from "./shared/cryptoAesGcm";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

export async function getPortalCreds(params: { agentId: string; portalId: string }) {
  const { agentId, portalId } = params;

  const keyB64 = String(process.env.PORTAL_ENC_KEY_B64 || "").trim();
  if (!keyB64) throw new Error("Missing PORTAL_ENC_KEY_B64 (Cloud Run secret)");

  const docId = `${agentId}_${portalId}`;
  const snap = await admin.firestore().collection("portalCredentials").doc(docId).get();
  if (!snap.exists) throw new Error(`Missing portalCredentials doc: ${docId}`);

  const data: any = snap.data() || {};
  const enc = data.enc as EncryptOut | undefined;
  if (!enc?.ivB64 || !enc?.tagB64 || !enc?.dataB64) {
    throw new Error(`Invalid enc payload in portalCredentials: ${docId}`);
  }

  const plain = decryptJsonAes256Gcm(keyB64, enc) as { username: string; password: string };
  const username = String(plain?.username || "").trim();
  const password = String(plain?.password || "").trim();
  if (!username || !password) throw new Error(`Decrypted creds empty: ${docId}`);

  return { username, password };
}
