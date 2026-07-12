/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb, nowTs } from "./shared/admin";
import {
  PORTAL_ENC_KEY_B64,
  SURENSE_ACTIVITY_API_KEY,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN,
} from "./shared/secrets";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";
import { FUNCTIONS_REGION } from "./shared/region";
import { updateReengagementLeadStatusImpl } from "./updateReengagementLeadStatus.impl";

const WA_API_URL = "https://graph.facebook.com/v25.0";



function s(v: any): string {
  return String(v ?? "").trim();
}

function normalizePhone(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");

  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  if (digits.length === 9) return "972" + digits;

  return digits;
}

function getInboundMessageText(message: any): string {
  const messageType = s(message?.type);

  if (messageType === "text") {
    return s(message?.text?.body);
  }

  if (messageType === "button") {
    return (
      s(message?.button?.text) ||
      s(message?.button?.payload)
    );
  }

  if (messageType === "interactive") {
    return (
      s(message?.interactive?.button_reply?.title) ||
      s(message?.interactive?.button_reply?.id) ||
      s(message?.interactive?.list_reply?.title) ||
      s(message?.interactive?.list_reply?.id)
    );
  }

  return "";
}

async function getQuickReplyAction(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  templateName: string,
  messageText: string
): Promise<"interested" | "declined" | null> {
  if (
    !agentId ||
    !templateName ||
    !messageText
  ) {
    return null;
  }

  const templateSnap = await db
    .doc(
      `agents/${agentId}/whatsapp_templates/${templateName}`
    )
    .get();

  if (!templateSnap.exists) {
    logger.warn(
      "[whatsappWebhook] template not found for quick reply",
      {
        agentId,
        templateName,
        messageText,
      }
    );

    return null;
  }

  const templateData =
    templateSnap.data() as any;

  const actions =
    templateData?.quickReplyActions &&
    typeof templateData.quickReplyActions === "object"
      ? templateData.quickReplyActions
      : {};

  const action = s(
    actions[s(messageText)]
  );

  if (
    action === "interested" ||
    action === "declined"
  ) {
    return action;
  }

  logger.warn(
    "[whatsappWebhook] quick reply action not mapped",
    {
      agentId,
      templateName,
      messageText,
      actions,
    }
  );

  return null;
}

async function getAgentBookingUrl(
  db: FirebaseFirestore.Firestore,
  agentId: string
): Promise<string> {
  const configSnap = await db
    .doc(
      `agents/${agentId}/config/whatsapp`
    )
    .get();

  if (!configSnap.exists) {
    return "";
  }

  return s(
    configSnap.data()?.bookingUrl
  );
}

async function findAgentByPhoneNumberId(
  db: FirebaseFirestore.Firestore,
  phoneNumberId: string
): Promise<string | null> {
  if (!phoneNumberId) return null;

  const snap = await db
    .doc(`whatsapp_phone_mappings/${phoneNumberId}`)
    .get();

  if (!snap.exists) {
    logger.warn(
      "[whatsappWebhook] phone mapping not found",
      { phoneNumberId }
    );
    return null;
  }

  return s(snap.data()?.agentId) || null;
}

async function findLeadByPhone(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  phoneNormalized: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  if (!agentId || !phoneNormalized) return null;

  const snap = await db
    .collection(`agents/${agentId}/reengagement_leads`)
    .where("phoneNormalized", "==", phoneNormalized)
    .limit(1)
    .get();

  if (snap.empty) return null;

  return snap.docs[0];
}

async function getAgentWhatsAppAccess(
  db: FirebaseFirestore.Firestore,
  agentId: string
): Promise<{
  phoneNumberId: string;
  accessToken: string;
}> {
  const configSnap = await db
    .doc(`agents/${agentId}/config/whatsapp`)
    .get();

  if (!configSnap.exists) {
    throw new Error(
      `WhatsApp config not found for agent ${agentId}`
    );
  }

  const phoneNumberId = s(
    configSnap.data()?.phoneNumberId
  );

  if (!phoneNumberId) {
    throw new Error(
      `Missing phoneNumberId for agent ${agentId}`
    );
  }

  const secretSnap = await db
    .doc(`agents/${agentId}/secrets/whatsapp`)
    .get();

  if (!secretSnap.exists) {
    throw new Error(
      `WhatsApp secret not found for agent ${agentId}`
    );
  }

  const keyB64 = PORTAL_ENC_KEY_B64.value();

  if (!keyB64) {
    throw new Error("Missing PORTAL_ENC_KEY_B64");
  }

  const secretData = secretSnap.data() as any;

  const decrypted = decryptJsonAes256Gcm(
    keyB64,
    secretData.enc
  ) as any;

  const accessToken = s(decrypted?.accessToken);

  if (!accessToken) {
    throw new Error(
      `Invalid WhatsApp token for agent ${agentId}`
    );
  }

  return {
    phoneNumberId,
    accessToken,
  };
}

async function sendWhatsAppTextMessage(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  to: string,
  text: string
): Promise<{
  waMessageId: string | null;
  phoneNumberId: string;
}> {
  const {
    phoneNumberId,
    accessToken,
  } = await getAgentWhatsAppAccess(
    db,
    agentId
  );

  const response = await fetch(
    `${WA_API_URL}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: true,
          body: text,
        },
      }),
    }
  );

  const json: any = await response.json();

  if (!response.ok) {
    throw new Error(
      json?.error?.message ||
      "Failed to send WhatsApp text message"
    );
  }

  return {
    waMessageId:
      s(json?.messages?.[0]?.id) || null,
    phoneNumberId,
  };
}

async function saveOutboundConversationMessage(
  db: FirebaseFirestore.Firestore,
  params: {
    agentId: string;
    phoneNumberId: string;
    customerPhone: string;
    customerName: string | null;
    leadId: string | null;
    text: string;
    waMessageId: string | null;
    messageType: string;
  }
): Promise<void> {
  const {
    agentId,
    phoneNumberId,
    customerPhone,
    customerName,
    leadId,
    text,
    waMessageId,
    messageType,
  } = params;

  const conversationId =
    `${agentId}_${customerPhone}`;

  const conversationRef = db.doc(
    `whatsapp_conversations/${conversationId}`
  );

  const messageRef = conversationRef
    .collection("messages")
    .doc(
      waMessageId ||
      `outbound_${Date.now()}`
    );

  await conversationRef.set(
    {
      agentId,
      phoneNumberId,
      customerPhone,
      customerName,
      leadId,
      status: "open",
      lastMessageText: text,
      lastMessageType: messageType,
      lastMessageDirection: "outbound",
      lastMessageAt: nowTs(),
      needsReply: false,
      updatedAt: nowTs(),
    },
    { merge: true }
  );

  await messageRef.set(
    {
      direction: "outbound",
      fromPhoneNumberId: phoneNumberId,
      to: customerPhone,
      type: messageType,
      text,
      waMessageId,
      status: "accepted",
      createdAt: nowTs(),
    },
    { merge: true }
  );
}

export const whatsappWebhook = onRequest(
  {
    region: FUNCTIONS_REGION,
    secrets: [
      WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      PORTAL_ENC_KEY_B64,
      SURENSE_ACTIVITY_API_KEY,
    ],
  },

  async (req, res) => {
    const db = adminDb();

    if (req.method === "GET") {
      const mode = s(req.query["hub.mode"]);
      const token = s(req.query["hub.verify_token"]);
      const challenge = s(req.query["hub.challenge"]);

      if (
        mode === "subscribe" &&
        token === WHATSAPP_WEBHOOK_VERIFY_TOKEN.value()
      ) {
        logger.info("[whatsappWebhook] verified");
        res.status(200).send(challenge);
        return;
      }

      logger.warn(
        "[whatsappWebhook] verification failed",
        { mode }
      );

      res.sendStatus(403);
      return;
    }

    if (req.method !== "POST") {
      res.sendStatus(405);
      return;
    }

    try {
      const body = req.body;

      logger.info(
        "[whatsappWebhook] incoming payload",
        JSON.stringify(body)
      );

      const entries = body?.entry ?? [];

      for (const entry of entries) {
        const changes = entry?.changes ?? [];

        for (const change of changes) {
          if (change?.field !== "messages") {
            continue;
          }

          const value = change?.value;
          const phoneNumberId = s(
            value?.metadata?.phone_number_id
          );

          const statuses = value?.statuses ?? [];

          for (const status of statuses) {
            const waMessageId = s(status?.id);
            const waStatus = s(status?.status);
            const timestamp = s(status?.timestamp);
            const recipientId = s(status?.recipient_id);
            const error = status?.errors?.[0] ?? null;

            logger.info(
              "[whatsappWebhook] status",
              {
                phoneNumberId,
                waMessageId,
                waStatus,
                recipientId,
                error,
              }
            );

            if (!waMessageId) continue;

            const leadQuery = await db
              .collectionGroup("reengagement_leads")
              .where("waMessageId", "==", waMessageId)
              .limit(1)
              .get();

            if (leadQuery.empty) {
              logger.warn(
                "[whatsappWebhook] waMessageId not found",
                {
                  waMessageId,
                  waStatus,
                }
              );
              continue;
            }

            const leadRef = leadQuery.docs[0].ref;

            const updateData: any = {
              waLastStatus: waStatus,
              waLastStatusAt: nowTs(),
              waRecipientId: recipientId || null,
              updatedAt: nowTs(),
            };

            if (timestamp) {
              updateData.waStatusTimestamp = timestamp;
            }

            if (waStatus === "sent") {
              updateData.status = "sent";
              updateData.waSentConfirmedAt = nowTs();
            }

            if (waStatus === "delivered") {
              updateData.status = "delivered";
              updateData.waDeliveredAt = nowTs();
            }

            if (waStatus === "read") {
              updateData.status = "read";
              updateData.waReadAt = nowTs();
            }

            if (waStatus === "failed") {
              updateData.status = "failed";
              updateData.waFailedAt = nowTs();
              updateData.waError = error;
            }

            await leadRef.update(updateData);
          }

          const messages = value?.messages ?? [];

          for (const message of messages) {
            const from = normalizePhone(
              s(message?.from)
            );

            const messageType = s(message?.type);
            const messageText =
              getInboundMessageText(message);

           

            const inboundWaMessageId =
              s(message?.id);

            logger.info(
              "[whatsappWebhook] inbound message received",
              {
                phoneNumberId,
                from,
                type: messageType,
                text: messageText,
                waMessageId: inboundWaMessageId,
              }
            );

            const agentId =
              await findAgentByPhoneNumberId(
                db,
                phoneNumberId
              );

            if (!agentId) {
              await db
                .collection("whatsapp_inbound_messages")
                .add({
                  phoneNumberId,
                  from,
                  type: messageType,
                  text: messageText,
                  waMessageId:
                    inboundWaMessageId || null,
                  rawJson:
                    JSON.stringify(message),
                  mappingStatus:
                    "agent_not_found",
                  createdAt: nowTs(),
                });

              continue;
            }

            const leadDoc =
              await findLeadByPhone(
                db,
                agentId,
                from
              );

            const leadId = leadDoc?.id ?? null;
            const leadData = leadDoc?.data() ?? null;
            const fullName =
              s(leadData?.fullName) || null;

          let templateName =
  s(leadData?.templateName);

const contextMessageId =
  s(message?.context?.id);

if (!templateName && contextMessageId) {
  const originalMessageSnap = await db
    .doc(
      `whatsapp_conversations/${agentId}_${from}/messages/${contextMessageId}`
    )
    .get();

  if (originalMessageSnap.exists) {
    templateName = s(
      originalMessageSnap.data()?.templateName
    );
  }
}

const quickReplyAction =
  await getQuickReplyAction(
    db,
    agentId,
    templateName,
    messageText
  );

          logger.info(
  "[whatsappWebhook] inbound message mapped",
  {
    agentId,
    phoneNumberId,
    from,
    templateName,
    contextMessageId,
    messageText,
    quickReplyAction,
    waMessageId: inboundWaMessageId,
  }
);

            const conversationId =
              `${agentId}_${from}`;

            const conversationRef = db.doc(
              `whatsapp_conversations/${conversationId}`
            );

            const conversationMessageRef =
              inboundWaMessageId
                ? conversationRef
                    .collection("messages")
                    .doc(inboundWaMessageId)
                : conversationRef
                    .collection("messages")
                    .doc();

            const existingMessage =
              await conversationMessageRef.get();

            if (existingMessage.exists) {
              logger.info(
                "[whatsappWebhook] duplicate inbound ignored",
                {
                  agentId,
                  from,
                  waMessageId: inboundWaMessageId,
                }
              );
              continue;
            }

            await db
              .collection("whatsapp_inbound_messages")
              .add({
                agentId,
                phoneNumberId,
                from,
                type: messageType,
                text: messageText,
                quickReplyAction,
                waMessageId:
                  inboundWaMessageId || null,
                leadId,
                fullName,
                rawJson:
                  JSON.stringify(message),
                createdAt: nowTs(),
              });

            const conversationSnap =
              await conversationRef.get();

            const conversationData: any = {
              agentId,
              phoneNumberId,
              customerPhone: from,
              customerName: fullName,
              leadId,
              status: "open",
              lastMessageText:
                messageText || `[${messageType}]`,
              lastMessageType: messageType,
              lastMessageDirection: "inbound",
              lastMessageAt: nowTs(),
              lastInboundAt: nowTs(),
              unreadCount: FieldValue.increment(1),
              needsReply: true,
              updatedAt: nowTs(),
            };

            if (!conversationSnap.exists) {
              conversationData.createdAt = nowTs();
            }

            await conversationRef.set(
              conversationData,
              { merge: true }
            );

            await conversationMessageRef.set({
              direction: "inbound",
              from,
              toPhoneNumberId: phoneNumberId,
              type: messageType,
              text: messageText || null,
              quickReplyAction,
              waMessageId:
                inboundWaMessageId || null,
              status: "received",
              rawJson:
                JSON.stringify(message),
              createdAt: nowTs(),
            });

            if (leadDoc) {
              await leadDoc.ref.update({
                hasInboundReply: true,
                lastInboundText:
                  messageText || null,
                lastInboundAt: nowTs(),
                conversationId,
                updatedAt: nowTs(),
              });
            }

            if (
              quickReplyAction === "declined" &&
              leadDoc
            ) {
              await updateReengagementLeadStatusImpl(
                agentId,
                leadDoc.id,
                "declined"
              );

              await conversationRef.set(
                {
                  needsReply: false,
                  updatedAt: nowTs(),
                },
                { merge: true }
              );
            }

            if (
              quickReplyAction === "interested" &&
              leadDoc
            ) {
              await leadDoc.ref.update({
                status: "interested",
                interestStatus: "interested",
                interestRespondedAt: nowTs(),
                bookingStatus: "not_sent",
                updatedAt: nowTs(),
              });

              const bookingUrl =
                await getAgentBookingUrl(
                  db,
                  agentId
                );

              if (!bookingUrl) {
                logger.error(
                  "[whatsappWebhook] missing bookingUrl",
                  {
                    agentId,
                    leadId: leadDoc.id,
                  }
                );

                await leadDoc.ref.update({
                  bookingStatus:
                    "missing_booking_url",
                  updatedAt:
                    nowTs(),
                });

                continue;
              }

              const bookingMessage =
                `בשמחה, ניתן לבחור מועד שמתאים לך בקישור הבא:\n\n${bookingUrl}\n\nלאחר קביעת הפגישה יישלח אליך אישור למייל.`;

              try {
                const sentResult =
                  await sendWhatsAppTextMessage(
                    db,
                    agentId,
                    from,
                    bookingMessage
                  );

                await saveOutboundConversationMessage(
                  db,
                  {
                    agentId,
                    phoneNumberId:
                      sentResult.phoneNumberId,
                    customerPhone: from,
                    customerName: fullName,
                    leadId: leadDoc.id,
                    text: bookingMessage,
                    waMessageId:
                      sentResult.waMessageId,
                    messageType:
                      "booking_link",
                  }
                );

                await leadDoc.ref.update({
                  bookingStatus: "link_sent",
                  bookingLink: bookingUrl,
                  bookingLinkSentAt: nowTs(),
                  bookingLinkWaMessageId:
                    sentResult.waMessageId,
                  updatedAt: nowTs(),
                });
              } catch (sendError: any) {
                logger.error(
                  "[whatsappWebhook] booking link send failed",
                  {
                    agentId,
                    leadId: leadDoc.id,
                    from,
                    error:
                      sendError?.message ||
                      String(sendError),
                  }
                );

                await leadDoc.ref.update({
                  bookingStatus: "send_failed",
                  bookingLinkSendError:
                    sendError?.message ||
                    String(sendError),
                  updatedAt: nowTs(),
                });
              }
            }

            logger.info(
              "[whatsappWebhook] inbound processed",
              {
                agentId,
                from,
                leadId,
                conversationId,
                quickReplyAction,
              }
            );
          }
        }
      }

      res.sendStatus(200);
    } catch (e: any) {
      logger.error(
        "[whatsappWebhook] error",
        e
      );

      res.sendStatus(500);
    }
  }
);
