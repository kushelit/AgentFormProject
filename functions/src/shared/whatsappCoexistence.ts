/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {logger} from "firebase-functions";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {nowTs} from "./admin";
import {getOrCreateMagicTouchContactFromWhatsApp} from "./getOrCreateMagicTouchContactFromWhatsApp";
import {
  downloadWhatsAppInboundMediaToStorage,
  getWhatsAppInboundMediaDescriptor,
} from "./downloadWhatsAppMedia";

/*
 * Coexistence: מספר שעובד גם באפליקציית WhatsApp Business וגם ב-Cloud API.
 *
 * אירועי webhook נוספים מעבר ל-"messages":
 * - smb_message_echoes: הודעה שהסוכן שלח מהטלפון. נשמרת כהודעה יוצאת.
 * - history: היסטוריית שיחות (עד 180 יום) אחרי החיבור.
 * - smb_app_state_sync: אנשי קשר מהטלפון.
 * - account_update (PARTNER_REMOVED): הסוכן ניתק את החיבור מהאפליקציה.
 *
 * עקרונות:
 * - הודעה מהטלפון והיסטוריה לא מעדכנות lastInboundAt (חלון 24 השעות של ה-API),
 *   לא מגדילות unreadCount, לא שולחות Push ולא מפעילות Flows או AI.
 * - הודעה מהטלפון משהה את תשובות ה-AI בשיחה (humanTakeover), כי הסוכן מטפל בעצמו.
 */

export const HUMAN_TAKEOVER_DEFAULT_PAUSE_MINUTES = 120;

export type CoexistenceDeps = {
  normalizePhone: (phone: string) => string;
  getMessageText: (message: any) => string;
  loadAccessToken: (args: {db: FirebaseFirestore.Firestore; agentId: string}) => Promise<string>;
};

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function timestampFromSeconds(value: unknown): Timestamp | null {
  const seconds = Number(s(value));

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Timestamp.fromMillis(seconds * 1000);
}

function timestampToMillis(value: any): number {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  return 0;
}

async function findPhoneMapping(
  db: FirebaseFirestore.Firestore,
  phoneNumberId: string
): Promise<{agentId: string; businessPhone: string} | null> {
  const id = s(phoneNumberId);

  if (!id || id.includes("/")) {
    return null;
  }

  const snap = await db.doc(`whatsapp_phone_mappings/${id}`).get();
  const agentId = s(snap.data()?.agentId);

  if (!snap.exists || !agentId) {
    logger.warn("[coexistence] Phone mapping not found", {phoneNumberId: id});
    return null;
  }

  return {
    agentId,
    businessPhone: s(snap.data()?.displayPhoneNumber),
  };
}

/*
 * זמן ההשהיה של תשובות ה-AI אחרי מענה ידני.
 * נקבע ב-systemConfig/magicTouchAI.humanTakeoverPauseMinutes (ברירת מחדל: 120).
 */
export async function getHumanTakeoverPauseMinutes(
  db: FirebaseFirestore.Firestore
): Promise<number> {
  try {
    const snap = await db.doc("systemConfig/magicTouchAI").get();
    const value = Number(snap.data()?.humanTakeoverPauseMinutes);

    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  } catch (error: any) {
    logger.warn("[coexistence] Failed to load humanTakeoverPauseMinutes", {
      error: error?.message || String(error),
    });
  }

  return HUMAN_TAKEOVER_DEFAULT_PAUSE_MINUTES;
}

export function buildHumanTakeover(
  pauseMinutes: number,
  source: "whatsapp_business_app" | "magictouch_manual",
  byUid?: string | null
): Record<string, any> {
  return {
    pausedUntil: Timestamp.fromMillis(Date.now() + pauseMinutes * 60 * 1000),
    source,
    byUid: byUid || null,
    at: nowTs(),
  };
}

/*
 * האם תשובות ה-AI מושהות בשיחה הזו (סוכן ענה ידנית לאחרונה).
 */
export function isHumanTakeoverActive(conversationData: any): boolean {
  return timestampToMillis(conversationData?.humanTakeover?.pausedUntil) > Date.now();
}

async function buildMessageMedia({
  db,
  deps,
  agentId,
  conversationId,
  message,
  download,
}: {
  db: FirebaseFirestore.Firestore;
  deps: CoexistenceDeps;
  agentId: string;
  conversationId: string;
  message: any;
  download: boolean;
}): Promise<{media: any; mediaDownloadError: string | null}> {
  const descriptor = getWhatsAppInboundMediaDescriptor(message);

  if (!descriptor) {
    return {media: null, mediaDownloadError: null};
  }

  const fallback = {
    mediaId: descriptor.mediaId,
    type: descriptor.type,
    mimeType: descriptor.mimeType || null,
    fileName: descriptor.fileName || null,
    caption: descriptor.caption || null,
    storagePath: null,
    size: null,
    sha256: null,
  };

  if (!download) {
    return {media: fallback, mediaDownloadError: null};
  }

  try {
    const accessToken = await deps.loadAccessToken({db, agentId});
    const stored = await downloadWhatsAppInboundMediaToStorage({
      agentId,
      conversationId,
      message,
      accessToken,
    });

    return {media: stored || fallback, mediaDownloadError: null};
  } catch (error: any) {
    return {media: fallback, mediaDownloadError: error?.message || String(error)};
  }
}

/* =========================================================
   smb_message_echoes: הודעה שהסוכן שלח מאפליקציית WhatsApp Business
   ========================================================= */

export async function handleMessageEchoes({
  db,
  deps,
  value,
}: {
  db: FirebaseFirestore.Firestore;
  deps: CoexistenceDeps;
  value: any;
}): Promise<void> {
  const phoneNumberId = s(value?.metadata?.phone_number_id);
  const echoes = Array.isArray(value?.message_echoes) ? value.message_echoes : [];

  if (!echoes.length) {
    return;
  }

  const mapping = await findPhoneMapping(db, phoneNumberId);

  if (!mapping) {
    return;
  }

  const {agentId} = mapping;
  const pauseMinutes = await getHumanTakeoverPauseMinutes(db);

  for (const echo of echoes) {
    try {
      const to = deps.normalizePhone(s(echo?.to));
      const waMessageId = s(echo?.id);

      if (!to || !waMessageId || waMessageId.includes("/")) {
        continue;
      }

      const conversationId = `${agentId}_${to}`;
      const conversationRef = db.doc(`whatsapp_conversations/${conversationId}`);
      const messageRef = conversationRef.collection("messages").doc(waMessageId);

      if ((await messageRef.get()).exists) {
        continue;
      }

      const conversationSnap = await conversationRef.get();
      const conversationData = conversationSnap.exists ? (conversationSnap.data() as any) : {};

      let contactId = s(conversationData?.contactId);

      if (!contactId) {
        const contactMatch = await getOrCreateMagicTouchContactFromWhatsApp({
          db,
          agentId,
          phone: to,
          profileName: null,
          waId: to,
          conversationId,
        });

        contactId = contactMatch.contactId;
      }

      const messageType = s(echo?.type) || "unknown";
      const messageText = deps.getMessageText(echo);
      const sentAt = timestampFromSeconds(echo?.timestamp) || Timestamp.now();

      const {media, mediaDownloadError} = await buildMessageMedia({
        db,
        deps,
        agentId,
        conversationId,
        message: echo,
        download: true,
      });

      const conversationUpdate: Record<string, any> = {
        agentId,
        contactId,
        phoneNumberId,
        customerPhone: to,
        status: "open",
        lastMessageText: messageText || `[${messageType}]`,
        lastMessageType: messageType,
        lastMessageDirection: "outbound",
        lastMessageAt: sentAt,
        lastMessageWaMessageId: waMessageId,
        lastMessageStatus: "sent",
        lastMessageStatusAt: sentAt,
        lastMessageProviderStatus: "sent",
        lastOutboundAt: sentAt,
        needsReply: false,
        humanTakeover: buildHumanTakeover(pauseMinutes, "whatsapp_business_app"),
        updatedAt: nowTs(),
      };

      if (!conversationSnap.exists) {
        conversationUpdate.createdAt = nowTs();
      }

      await Promise.all([
        conversationRef.set(conversationUpdate, {merge: true}),

        messageRef.set({
          agentId,
          contactId,
          conversationId,
          direction: "outbound",
          from: deps.normalizePhone(s(echo?.from)) || null,
          to,
          fromPhoneNumberId: phoneNumberId,
          type: messageType,
          text: messageText || null,
          media,
          mediaDownloadError,
          contextMessageId: s(echo?.context?.id) || null,
          waMessageId,
          status: "sent",
          sentVia: "whatsapp_business_app",
          source: "smb_message_echo",
          rawJson: JSON.stringify(echo || {}),
          createdAt: sentAt,
          updatedAt: nowTs(),
        }),
      ]);
    } catch (error: any) {
      logger.error("[coexistence] Failed to store message echo", {
        agentId,
        phoneNumberId,
        waMessageId: s(echo?.id),
        error: error?.message || String(error),
      });
    }
  }
}

/* =========================================================
   history: היסטוריית שיחות אחרי החיבור
   ========================================================= */

export async function handleHistory({
  db,
  deps,
  value,
}: {
  db: FirebaseFirestore.Firestore;
  deps: CoexistenceDeps;
  value: any;
}): Promise<void> {
  const phoneNumberId = s(value?.metadata?.phone_number_id);
  const historyItems = Array.isArray(value?.history) ? value.history : [];

  const mapping = await findPhoneMapping(db, phoneNumberId);

  if (!mapping) {
    return;
  }

  const {agentId} = mapping;
  const configRef = db.doc(`agents/${agentId}/config/whatsapp`);

  for (const item of historyItems) {
    // הסוכן סירב לשתף היסטוריה באפליקציה
    if (Array.isArray(item?.errors) && item.errors.length) {
      const firstError = item.errors[0] || {};

      await configRef.set(
        {
          coexistenceSync: {
            history: {
              status: "declined",
              error: s(firstError.title) || s(firstError.message) || "History sync declined",
              errorCode: firstError.code ?? null,
              updatedAt: nowTs(),
            },
          },
          updatedAt: nowTs(),
        },
        {merge: true}
      );

      continue;
    }

    const threads = Array.isArray(item?.threads) ? item.threads : [];
    let storedCount = 0;

    for (const thread of threads) {
      try {
        storedCount += await storeHistoryThread({
          db,
          deps,
          agentId,
          phoneNumberId,
          thread,
        });
      } catch (error: any) {
        logger.error("[coexistence] Failed to store history thread", {
          agentId,
          phoneNumberId,
          error: error?.message || String(error),
        });
      }
    }

    await configRef.set(
      {
        coexistenceSync: {
          history: {
            status: "receiving",
            phase: item?.metadata?.phase ?? null,
            chunkOrder: item?.metadata?.chunk_order ?? null,
            progress: item?.metadata?.progress ?? null,
            storedMessages: FieldValue.increment(storedCount),
            lastChunkAt: nowTs(),
            updatedAt: nowTs(),
          },
        },
        updatedAt: nowTs(),
      },
      {merge: true}
    );
  }
}

async function storeHistoryThread({
  db,
  deps,
  agentId,
  phoneNumberId,
  thread,
}: {
  db: FirebaseFirestore.Firestore;
  deps: CoexistenceDeps;
  agentId: string;
  phoneNumberId: string;
  thread: any;
}): Promise<number> {
  const customerPhone = deps.normalizePhone(s(thread?.id));
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];

  if (!customerPhone || !messages.length) {
    return 0;
  }

  const conversationId = `${agentId}_${customerPhone}`;
  const conversationRef = db.doc(`whatsapp_conversations/${conversationId}`);
  const conversationSnap = await conversationRef.get();
  const conversationData = conversationSnap.exists ? (conversationSnap.data() as any) : {};

  let contactId = s(conversationData?.contactId);

  if (!contactId) {
    const contactMatch = await getOrCreateMagicTouchContactFromWhatsApp({
      db,
      agentId,
      phone: customerPhone,
      profileName: null,
      waId: customerPhone,
      conversationId,
    });

    contactId = contactMatch.contactId;
  }

  let stored = 0;
  let latest: {at: Timestamp; text: string; type: string; direction: string; waMessageId: string} | null = null;
  let batch = db.batch();
  let batchSize = 0;

  // קריאה מרוכזת של הודעות שכבר קיימות, במקום קריאה לכל הודעה בנפרד
  const validMessages = messages.filter((message: any) => {
    const id = s(message?.id);
    return Boolean(id) && !id.includes("/");
  });

  const existingIds = new Set<string>();

  for (let index = 0; index < validMessages.length; index += 100) {
    const refs = validMessages
      .slice(index, index + 100)
      .map((message: any) => conversationRef.collection("messages").doc(s(message.id)));

    const snaps = await db.getAll(...refs);

    snaps.forEach((snap) => {
      if (snap.exists) {
        existingIds.add(snap.id);
      }
    });
  }

  for (const message of validMessages) {
    const waMessageId = s(message?.id);

    if (existingIds.has(waMessageId)) {
      continue;
    }

    const messageRef = conversationRef.collection("messages").doc(waMessageId);

    const direction = deps.normalizePhone(s(message?.from)) === customerPhone ? "inbound" : "outbound";
    const messageType = s(message?.type) || "unknown";
    const messageText = deps.getMessageText(message);
    const at = timestampFromSeconds(message?.timestamp) || Timestamp.now();

    // מדיה מההיסטוריה לא מורידים (Meta שומרת מדיה רק ל-14 יום); נשמר רק התיאור
    const {media} = await buildMessageMedia({
      db,
      deps,
      agentId,
      conversationId,
      message,
      download: false,
    });

    batch.set(messageRef, {
      agentId,
      contactId,
      conversationId,
      direction,
      from: deps.normalizePhone(s(message?.from)) || null,
      ...(direction === "inbound" ? {toPhoneNumberId: phoneNumberId} : {to: customerPhone, fromPhoneNumberId: phoneNumberId}),
      type: messageType,
      text: messageText || null,
      media,
      contextMessageId: s(message?.context?.id) || null,
      waMessageId,
      status: direction === "inbound" ? "received" : s(message?.history_context?.status).toLowerCase() || "sent",
      source: "history_sync",
      rawJson: JSON.stringify(message || {}),
      createdAt: at,
      updatedAt: nowTs(),
    });

    batchSize += 1;
    stored += 1;

    if (!latest || at.toMillis() > latest.at.toMillis()) {
      latest = {at, text: messageText, type: messageType, direction, waMessageId};
    }

    if (batchSize >= 400) {
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  /*
   * מעדכנים את פרטי ההודעה האחרונה רק אם ההיסטוריה חדשה יותר ממה שכבר יש בשיחה.
   * לא נוגעים ב-lastInboundAt ו-unreadCount: לפי Meta, הודעות מלפני החיבור
   * לא פותחות חלון שירות.
   */
  const conversationUpdate: Record<string, any> = {
    agentId,
    contactId,
    phoneNumberId,
    customerPhone,
    historySyncedAt: nowTs(),
    updatedAt: nowTs(),
  };

  if (!conversationSnap.exists) {
    conversationUpdate.status = "open";
    conversationUpdate.createdAt = nowTs();
  }

  if (latest && latest.at.toMillis() > timestampToMillis(conversationData?.lastMessageAt)) {
    conversationUpdate.lastMessageText = latest.text || `[${latest.type}]`;
    conversationUpdate.lastMessageType = latest.type;
    conversationUpdate.lastMessageDirection = latest.direction;
    conversationUpdate.lastMessageAt = latest.at;
    conversationUpdate.lastMessageWaMessageId = latest.direction === "outbound" ? latest.waMessageId : null;
  }

  await conversationRef.set(conversationUpdate, {merge: true});

  return stored;
}

/* =========================================================
   smb_app_state_sync: אנשי קשר מהטלפון
   ========================================================= */

export async function handleStateSync({
  db,
  deps,
  value,
}: {
  db: FirebaseFirestore.Firestore;
  deps: CoexistenceDeps;
  value: any;
}): Promise<void> {
  const phoneNumberId = s(value?.metadata?.phone_number_id);
  const items = Array.isArray(value?.state_sync) ? value.state_sync : [];

  const mapping = await findPhoneMapping(db, phoneNumberId);

  if (!mapping) {
    return;
  }

  const {agentId} = mapping;
  let added = 0;

  for (const item of items) {
    if (s(item?.type) !== "contact" || s(item?.action) !== "add") {
      // הסרת איש קשר בטלפון לא מוחקת אותו מ-MagicTouch
      continue;
    }

    const phone = deps.normalizePhone(s(item?.contact?.phone_number));

    if (!phone) {
      continue;
    }

    try {
      await getOrCreateMagicTouchContactFromWhatsApp({
        db,
        agentId,
        phone,
        profileName: s(item?.contact?.full_name) || s(item?.contact?.first_name) || null,
        waId: phone,
        conversationId: null,
      });

      added += 1;
    } catch (error: any) {
      logger.error("[coexistence] Failed to sync contact", {
        agentId,
        error: error?.message || String(error),
      });
    }
  }

  await db.doc(`agents/${agentId}/config/whatsapp`).set(
    {
      coexistenceSync: {
        contacts: {
          status: "receiving",
          syncedContacts: FieldValue.increment(added),
          lastEventAt: nowTs(),
          updatedAt: nowTs(),
        },
      },
      updatedAt: nowTs(),
    },
    {merge: true}
  );
}

/* =========================================================
   account_update: הסוכן ניתק את החיבור מאפליקציית WhatsApp Business
   ========================================================= */

export async function handleAccountUpdate({
  db,
  wabaId,
  value,
}: {
  db: FirebaseFirestore.Firestore;
  wabaId: string;
  value: any;
}): Promise<void> {
  if (s(value?.event) !== "PARTNER_REMOVED" || !s(wabaId)) {
    return;
  }

  const mappingsSnap = await db
    .collection("whatsapp_phone_mappings")
    .where("wabaId", "==", s(wabaId))
    .get();

  for (const mappingDoc of mappingsSnap.docs) {
    const agentId = s(mappingDoc.data()?.agentId);

    if (!agentId || agentId.includes("/")) {
      continue;
    }

    const batch = db.batch();

    batch.set(
      db.doc(`agents/${agentId}/config/whatsapp`),
      {
        status: "disconnected",
        phoneRegistered: false,
        webhookSubscribed: false,
        disconnectedAt: nowTs(),
        disconnectedBy: "meta_partner_removed",
        disconnectionInfo: {
          reason: s(value?.disconnection_info?.reason) || null,
          initiatedBy: s(value?.disconnection_info?.initiated_by) || null,
        },
        updatedAt: nowTs(),
      },
      {merge: true}
    );

    batch.delete(mappingDoc.ref);
    batch.delete(db.doc(`agents/${agentId}/secrets/whatsapp`));

    await batch.commit();

    logger.info("[coexistence] Disconnected after PARTNER_REMOVED", {
      agentId,
      wabaId,
      phoneNumberId: mappingDoc.id,
      reason: s(value?.disconnection_info?.reason) || null,
    });
  }
}
