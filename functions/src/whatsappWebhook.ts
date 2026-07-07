/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb, nowTs } from "./shared/admin";
import { WHATSAPP_WEBHOOK_VERIFY_TOKEN } from "./shared/secrets";
import { FUNCTIONS_REGION } from "./shared/region";


function s(v: any): string {
  return String(v ?? "").trim();
}


function normalizePhone(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");

  if (digits.startsWith("972")) return digits;

  if (digits.startsWith("0")) {
    return "972" + digits.slice(1);
  }

  if (digits.length === 9) {
    return "972" + digits;
  }

  return digits;
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
    logger.warn("[whatsappWebhook] phone mapping not found", {
      phoneNumberId,
    });

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


export const whatsappWebhook = onRequest(
  {
    region: FUNCTIONS_REGION,
    secrets: [WHATSAPP_WEBHOOK_VERIFY_TOKEN],
  },

  async (req, res) => {
    const db = adminDb();


    // ============================================================
    // META WEBHOOK VERIFICATION
    // ============================================================

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

      logger.warn("[whatsappWebhook] verification failed", {
        mode,
      });

      res.sendStatus(403);
      return;
    }


    // ============================================================
    // ONLY POST IS ALLOWED
    // ============================================================

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
          if (change?.field !== "messages") continue;

          const value = change?.value;

          const phoneNumberId = s(
            value?.metadata?.phone_number_id
          );


          // ======================================================
          // MESSAGE STATUS EVENTS
          // sent / delivered / read / failed
          // ======================================================

          const statuses = value?.statuses ?? [];


          for (const status of statuses) {
            const waMessageId = s(status?.id);
            const waStatus = s(status?.status);
            const timestamp = s(status?.timestamp);
            const recipientId = s(status?.recipient_id);
            const error = status?.errors?.[0] ?? null;


            logger.info("[whatsappWebhook] status", {
              phoneNumberId,
              waMessageId,
              waStatus,
              recipientId,
              error,
            });


            if (!waMessageId) continue;


            const q = await db
              .collectionGroup("reengagement_leads")
              .where("waMessageId", "==", waMessageId)
              .limit(1)
              .get();


            if (q.empty) {
              logger.warn(
                "[whatsappWebhook] waMessageId not found",
                {
                  waMessageId,
                  waStatus,
                }
              );

              continue;
            }


            const leadRef = q.docs[0].ref;


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


          // ======================================================
          // INBOUND MESSAGES
          // ======================================================

          const messages = value?.messages ?? [];


          for (const message of messages) {
            const from = normalizePhone(
              s(message?.from)
            );

            const messageType = s(message?.type);

            const messageText =
              messageType === "text"
                ? s(message?.text?.body)
                : "";

            const inboundWaMessageId = s(message?.id);


            logger.info(
              "[whatsappWebhook] inbound message",
              {
                phoneNumberId,
                from,
                type: messageType,
                text: messageText,
                waMessageId: inboundWaMessageId,
              }
            );


            // ====================================================
            // FIND AGENT
            // ====================================================

            const agentId =
              await findAgentByPhoneNumberId(
                db,
                phoneNumberId
              );


            if (!agentId) {
              logger.warn(
                "[whatsappWebhook] agent not found",
                {
                  phoneNumberId,
                  from,
                }
              );


              await db
                .collection("whatsapp_inbound_messages")
                .add({
                  phoneNumberId,
                  from,
                  type: messageType,
                  text: messageText,
                  waMessageId:
                    inboundWaMessageId || null,
                  raw: message,
                  mappingStatus: "agent_not_found",
                  createdAt: nowTs(),
                });


              continue;
            }


            // ====================================================
            // FIND REENGAGEMENT LEAD
            // ====================================================

            const leadDoc =
              await findLeadByPhone(
                db,
                agentId,
                from
              );


            const leadId =
              leadDoc?.id ?? null;

            const leadData =
              leadDoc?.data() ?? null;

            const fullName =
              s(leadData?.fullName) || null;


            // ====================================================
            // CONVERSATION REFERENCES
            // ====================================================

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


            // ====================================================
            // CHECK DUPLICATE MESSAGE
            // META MAY SEND WEBHOOK RETRIES
            // ====================================================

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


            // ====================================================
            // SAVE RAW INBOUND MESSAGE
            // ====================================================

            await db
              .collection("whatsapp_inbound_messages")
              .add({
                agentId,
                phoneNumberId,
                from,
                type: messageType,
                text: messageText,
                waMessageId:
                  inboundWaMessageId || null,
                leadId,
                fullName,
                raw: message,
                createdAt: nowTs(),
              });


            // ====================================================
            // CREATE / UPDATE CONVERSATION
            // ====================================================

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

              lastMessageType:
                messageType,

              lastMessageDirection:
                "inbound",

              lastMessageAt:
                nowTs(),
                lastInboundAt: nowTs(),
                unreadCount:
                FieldValue.increment(1),
                needsReply: true,

              updatedAt:
                nowTs(),

            };


            if (!conversationSnap.exists) {
              conversationData.createdAt = nowTs();
            }


            await conversationRef.set(
              conversationData,
              {
                merge: true,
              }
            );


            // ====================================================
            // SAVE MESSAGE INSIDE CONVERSATION
            // ====================================================

            await conversationMessageRef.set(
              {
                direction: "inbound",

                from,

                toPhoneNumberId:
                  phoneNumberId,

                type:
                  messageType,

                text:
                  messageText || null,

                waMessageId:
                  inboundWaMessageId || null,

                status:
                  "received",

                raw:
                  message,

                createdAt:
                  nowTs(),
              }
            );


            // ====================================================
            // UPDATE LEAD
            // ====================================================

            if (leadDoc) {
              await leadDoc.ref.update({
                hasInboundReply: true,

                lastInboundText:
                  messageText || null,

                lastInboundAt:
                  nowTs(),

                conversationId,

                updatedAt:
                  nowTs(),
              });
            }


            logger.info(
              "[whatsappWebhook] inbound processed",
              {
                agentId,
                from,
                leadId,
                conversationId,
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