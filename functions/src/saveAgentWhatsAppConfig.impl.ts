/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import {
  PORTAL_ENC_KEY_B64,
  META_APP_ID,
  META_APP_SECRET,
} from "./shared/secrets";
import { encryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

function s(v: any) {
  return String(v ?? "").trim();
}

async function exchangeEmbeddedSignupCode(code: string, redirectUri: string): Promise<string> {
  const clientId = META_APP_ID.value();
  const clientSecret = META_APP_SECRET.value();

  if (!clientId || !clientSecret) {
    throw new HttpsError("internal", "Missing Meta app credentials");
  }

  if (!redirectUri) {
    throw new HttpsError("invalid-argument", "Missing redirectUri");
  }

  const res = await fetch("https://graph.facebook.com/v25.0/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const json: any = await res.json();

  if (!res.ok || !json?.access_token) {
    console.error("[exchangeEmbeddedSignupCode] Meta error", json);
    throw new HttpsError(
      "failed-precondition",
      json?.error?.message || "Failed to exchange Embedded Signup code"
    );
  }

  return String(json.access_token);
}

export async function saveAgentWhatsAppConfigImpl(req: any): Promise<object> {
  const authUid = req.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Login required");

  const db = adminDb();

  const userSnap = await (db as any).collection("users").doc(authUid).get();
  if (!userSnap.exists) throw new HttpsError("permission-denied", "User not found");

  const userData = userSnap.data() as any;
  const isAdmin = userData?.role === "admin" || userData?.isSystem === true;
  if (!isAdmin) throw new HttpsError("permission-denied", "Admin only");

  const body = req.data || {};

  const agentId = s(body.agentId);
  const businessId = s(body.businessId);
  const wabaId = s(body.wabaId);
  const phoneNumberId = s(body.phoneNumberId);
  const displayPhoneNumber = s(body.displayPhoneNumber);
  const displayName = s(body.displayName);
  const templateName = s(body.templateName);
  const embeddedSignupCode = s(body.embeddedSignupCode);
  const redirectUri = s(body.redirectUri);

  if (!agentId || !businessId || !wabaId || !phoneNumberId) {
    throw new HttpsError("invalid-argument", "Missing agentId / businessId / wabaId / phoneNumberId");
  }

  if (!embeddedSignupCode) {
    throw new HttpsError("invalid-argument", "Missing embeddedSignupCode");
  }

  const keyB64 = PORTAL_ENC_KEY_B64.value();
  if (!keyB64) throw new HttpsError("internal", "Missing encryption key");

  const accessToken = await exchangeEmbeddedSignupCode(embeddedSignupCode, redirectUri);
  const enc = encryptJsonAes256Gcm(keyB64, { accessToken });

  const configRef = (db as any).doc(`agents/${agentId}/config/whatsapp`);
  const secretRef = (db as any).doc(`agents/${agentId}/secrets/whatsapp`);
  const phoneMappingRef = (db as any).doc(`whatsapp_phone_mappings/${phoneNumberId}`);
  const batch = (db as any).batch();

  const configData: any = {
    provider: "meta_cloud_api",
    status: "connected",
    businessId,
    wabaId,
    phoneNumberId,
    displayPhoneNumber,
    displayName,
    connectedVia: "embedded_signup",
    connectedAt: nowTs(),
    updatedAt: nowTs(),
    updatedBy: authUid,
  };

  if (templateName) configData.templateName = templateName;

  batch.set(configRef, configData, { merge: true });
  batch.set(secretRef, {
    enc,
    tokenType: "embedded_signup_access_token",
    source: "embedded_signup",
    businessId,
    wabaId,
    phoneNumberId,
    updatedAt: nowTs(),
    updatedBy: authUid,
  }, { merge: true });


batch.set(phoneMappingRef, {
  agentId,
  businessId,
  wabaId,
  phoneNumberId,
  displayPhoneNumber,
  displayName,
  status: "active",
  source: "embedded_signup",
  updatedAt: nowTs(),
  updatedBy: authUid,
}, { merge: true });

  await batch.commit();

  return { ok: true, agentId, businessId, wabaId, phoneNumberId };
}