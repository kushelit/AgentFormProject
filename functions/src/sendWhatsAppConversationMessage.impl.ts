/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

const WA_API_URL = "https://graph.facebook.com/v19.0";

function s(v: any): string {
  return String(v ?? "").trim();
}

export async function sendWhatsAppConversationMessageImpl(
  agentId: string,
  data: any
): Promise<object> {
  const db = adminDb();

  const conversationId = s(data?.conversationId);
  const text = s(data?.text);

  if (!conversationId) {
    throw new HttpsError("invalid-argument", "Missing conversationId");
  }

  if (!text) {
    throw new HttpsError("invalid-argument", "Missing text");
  }

  const conversationRef = (db as any).doc(`whatsapp_conversations/${conversationId}`);
  const conversationSnap = await conversationRef.get();

  if (!conversationSnap.exists) {
    throw new HttpsError("not-found", "Conversation not found");
  }

  const conversation = conversationSnap.data() as any;

  if (conversation.agentId !== agentId) {
    throw new HttpsError("permission-denied", "Conversation does not belong to agent");
  }

  const customerPhone = s(conversation.customerPhone);
  const phoneNumberId = s(conversation.phoneNumberId);

  if (!customerPhone || !phoneNumberId) {
    throw new HttpsError("failed-precondition", "Conversation missing phone data");
  }

  const waSecretSnap = await (db as any)
    .doc(`agents/${agentId}/secrets/whatsapp`)
    .get();

  if (!waSecretSnap.exists) {
    throw new HttpsError("failed-precondition", "WhatsApp token not configured");
  }

  const keyB64 = PORTAL_ENC_KEY_B64.value();
  if (!keyB64) throw new HttpsError("internal", "Missing encryption key");

  const waSecret = waSecretSnap.data() as any;
  const { accessToken } = decryptJsonAes256Gcm(keyB64, waSecret.enc) as any;

  if (!accessToken) {
    throw new HttpsError("failed-precondition", "Invalid WhatsApp token");
  }

  const waRes = await fetch(`${WA_API_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: customerPhone,
      type: "text",
      text: {
        preview_url: false,
        body: text,
      },
    }),
  });

  const waData: any = await waRes.json();
  const waMessageId = waData?.messages?.[0]?.id ?? null;

  if (!waRes.ok || !waMessageId) {
    console.error("[sendWhatsAppConversationMessage] WA error:", JSON.stringify(waData));

    throw new HttpsError(
      "failed-precondition",
      waData?.error?.message || "Failed to send WhatsApp message"
    );
  }

  const messageRef = conversationRef
    .collection("messages")
    .doc(waMessageId);

  await messageRef.set({
    direction: "outbound",
    fromPhoneNumberId: phoneNumberId,
    to: customerPhone,
    type: "text",
    text,
    waMessageId,
    status: "sent",
    createdAt: nowTs(),
  });

  await conversationRef.set({
    lastMessageText: text,
    lastMessageType: "text",
    lastMessageDirection: "outbound",
    lastMessageAt: nowTs(),
    unreadCount: 0,
  needsReply: false,
    updatedAt: nowTs(),
  }, { merge: true });

  return {
    ok: true,
    conversationId,
    waMessageId,
  };
}