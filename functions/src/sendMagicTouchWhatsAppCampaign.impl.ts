/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  requireBackendPermission,
} from "./shared/backendPermissions";

import {
  loadMagicTouchWhatsAppTemplateContext,
  sendMagicTouchTemplateToContact,
} from "./shared/sendMagicTouchWhatsAppTemplateService";

const MAX_CONTACTS_PER_BATCH =
  100;

const MAX_CAMPAIGNS_RETURNED =
  200;

type CampaignResultItem = {
  contactId: string;
  ok: boolean;

  skipped?: boolean;
  skipReason?: string;

  waMessageId?: string;
  conversationId?: string;

  error?: string;
};

type AgentAccessContext = {
  db: FirebaseFirestore.Firestore;
  authUid: string;
  agentId: string;
  userData: any;
};

function normalizeContactIds(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(
          (
            contactId
          ) =>
            safeString(
              contactId
            )
        )
        .filter(Boolean)
    )
  );
}

function n(
  value: unknown
): number {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 0;
  }

  return parsed;
}

function timestampToMillis(
  value: any
): number | null {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
      "number"
  ) {
    return value;
  }

  if (
    typeof value?.toMillis ===
      "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value?._seconds ===
      "number"
  ) {
    return (
      value._seconds *
      1000
    );
  }

  if (
    typeof value?.seconds ===
      "number"
  ) {
    return (
      value.seconds *
      1000
    );
  }

  return null;
}

async function resolveAgentAccess(
  req: any
): Promise<AgentAccessContext> {
  const authUid =
    safeString(
      req.auth?.uid
    );

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const requestedAgentId =
    safeString(
      req.data?.agentId
    );

  const db =
    adminDb();

  const userSnap =
    await (db as any)
      .collection(
        "users"
      )
      .doc(
        authUid
      )
      .get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  await requireBackendPermission({
    db:
      db as any,

    userId:
      authUid,

    userData,

    permission:
      "access_magic_touch",
  });

  const isAdmin =
    userData?.role ===
      "admin" ||
    userData?.isSystem ===
      true;

  const userAgentId =
    safeString(
      userData?.agentId
    ) ||
    authUid;

  const agentId =
    requestedAgentId ||
    userAgentId;

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (
    !isAdmin &&
    agentId !==
      userAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot access campaigns for another agent"
    );
  }

  return {
    db:
      db as any,

    authUid,

    agentId,

    userData,
  };
}

export async function getMagicTouchCampaignsImpl(
  req: any
): Promise<object> {
  const {
    db,
    agentId,
  } =
    await resolveAgentAccess(
      req
    );

  const snapshot =
    await (db as any)
      .collection(
        `agents/${agentId}/magic_touch_campaigns`
      )
      .limit(
        MAX_CAMPAIGNS_RETURNED
      )
      .get();

  const includeMerged =
    req.data?.includeMerged ===
    true;

  const campaigns =
    snapshot.docs
      .map(
        (
          doc: any
        ) => {
          const data =
            doc.data() as any;

          return {
            campaignId:
              safeString(
                data?.campaignId
              ) ||
              doc.id,

            agentId:
              safeString(
                data?.agentId
              ) ||
              agentId,

            name:
              safeString(
                data?.name
              ) ||
              safeString(
                data?.templateName
              ) ||
              doc.id,

            channel:
              safeString(
                data?.channel
              ) ||
              "whatsapp",

            templateName:
              safeString(
                data?.templateName
              ),

            templateLanguage:
              safeString(
                data?.templateLanguage
              ) ||
              null,

            status:
              safeString(
                data?.status
              ) ||
              "active",

            lastBatchStatus:
              safeString(
                data?.lastBatchStatus
              ) ||
              null,

            totalContacts:
              n(
                data?.totalContacts
              ),

            sentCount:
              n(
                data?.sentCount
              ),

            deliveredCount:
              n(
                data?.deliveredCount
              ),

            readCount:
              n(
                data?.readCount
              ),

            repliedCount:
              n(
                data?.repliedCount
              ),

            failedCount:
              n(
                data?.failedCount
              ),

            processedCount:
              n(
                data?.processedCount
              ),

            createdBy:
              safeString(
                data?.createdBy
              ) ||
              null,

            createdByName:
              safeString(
                data?.createdByName
              ) ||
              null,

            startedAt:
              timestampToMillis(
                data?.startedAt
              ),

            createdAt:
              timestampToMillis(
                data?.createdAt
              ),

            updatedAt:
              timestampToMillis(
                data?.updatedAt
              ),

            lastBatchCompletedAt:
              timestampToMillis(
                data?.lastBatchCompletedAt
              ),

            completedAt:
              timestampToMillis(
                data?.completedAt
              ),

            statsRecalculatedAt:
              timestampToMillis(
                data?.statsRecalculatedAt
              ),
          };
        }
      )
      .filter(
        (
          campaign: any
        ) =>
          includeMerged ||
          campaign.status !==
            "merged"
      )
      .sort(
        (
          left: any,
          right: any
        ) =>
          Number(
            right.updatedAt ||
            right.createdAt ||
            0
          ) -
          Number(
            left.updatedAt ||
            left.createdAt ||
            0
          )
      );

  return {
    ok:
      true,

    agentId,

    campaigns,

    count:
      campaigns.length,
  };
}

function normalizeCampaignStorageKey(
  value: unknown
): string {
  return safeString(
    value
  )
    .replace(
      /\./g,
      "_"
    )
    .trim();
}

function recipientStatusRank(
  status: unknown
): number {
  switch (
    safeString(
      status
    ).toLowerCase()
  ) {
    case "replied":
      return 70;

    case "read":
      return 60;

    case "delivered":
      return 50;

    case "sent":
    case "accepted":
      return 40;

    case "failed":
      return 20;

    case "processing":
      return 10;

    default:
      return 0;
  }
}

function dataTimestampMillis(
  value: any
): number {
  return Number(
    timestampToMillis(
      value?.updatedAt ||
      value?.repliedAt ||
      value?.readAt ||
      value?.deliveredAt ||
      value?.sentAt ||
      value?.failedAt ||
      value?.createdAt
    ) ||
    0
  );
}

function chooseBetterStatusRecord(
  current: any,
  candidate: any
): any {
  if (!current) {
    return candidate;
  }

  if (!candidate) {
    return current;
  }

  const currentRank =
    recipientStatusRank(
      current?.status
    );

  const candidateRank =
    recipientStatusRank(
      candidate?.status
    );

  if (
    candidateRank >
    currentRank
  ) {
    return candidate;
  }

  if (
    candidateRank <
    currentRank
  ) {
    return current;
  }

  return dataTimestampMillis(
    candidate
  ) >=
    dataTimestampMillis(
      current
    )
    ? candidate
    : current;
}

async function getAllInChunks(
  db: FirebaseFirestore.Firestore,
  refs: FirebaseFirestore.DocumentReference[],
  chunkSize = 200
): Promise<FirebaseFirestore.DocumentSnapshot[]> {
  const results:
    FirebaseFirestore.DocumentSnapshot[] =
    [];

  for (
    let index = 0;
    index <
    refs.length;
    index +=
      chunkSize
  ) {
    const chunk =
      refs.slice(
        index,
        index +
          chunkSize
      );

    if (
      chunk.length ===
      0
    ) {
      continue;
    }

    const snapshots =
      await (db as any)
        .getAll(
          ...chunk
        );

    results.push(
      ...snapshots
    );
  }

  return results;
}

/*
 * תיקון / חישוב מחדש של סטטיסטיקות קמפיין.
 *
 * חשוב:
 * אנחנו לא מסתמכים רק על recipient.status.
 *
 * תגובות נכנסות נשמרו עד כה גם תחת:
 * contact.engagement.campaigns[campaignId]
 *
 * לכן אנחנו מאחדים את שני מקורות המידע.
 */
export async function recalculateMagicTouchCampaignStatsImpl(
  req: any
): Promise<object> {
  const {
    db,
    agentId,
  } =
    await resolveAgentAccess(
      req
    );

  const campaignId =
    safeString(
      req.data?.campaignId
    );

  if (
    !campaignId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing campaignId"
    );
  }

  if (
    campaignId.includes(
      "/"
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid campaignId"
    );
  }

  const campaignRef =
    (db as any)
      .doc(
        `agents/${agentId}/magic_touch_campaigns/${campaignId}`
      );

  const campaignSnap =
    await campaignRef.get();

  if (
    !campaignSnap.exists
  ) {
    throw new HttpsError(
      "not-found",
      "Campaign not found"
    );
  }

  const campaignData =
    campaignSnap.data() as any;

  const storedAgentId =
    safeString(
      campaignData?.agentId
    );

  if (
    storedAgentId &&
    storedAgentId !==
      agentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Campaign belongs to another agent"
    );
  }

  const recipientsSnap =
    await campaignRef
      .collection(
        "recipients"
      )
      .get();

  type CampaignRecipientRecord = {
  contactId: string;
  ref: FirebaseFirestore.DocumentReference;
  data: any;
};

const recipients:
  CampaignRecipientRecord[] =
  (
    recipientsSnap.docs as
      FirebaseFirestore.QueryDocumentSnapshot[]
  ).map(
    (
      doc:
        FirebaseFirestore.QueryDocumentSnapshot
    ) => {
      const data =
        doc.data() as any;

      return {
        contactId:
          safeString(
            data?.contactId
          ) ||
          doc.id,

        ref:
          doc.ref,

        data,
      };
    }
  );

const contactIds:
  string[] =
  recipients
    .map(
      (
        recipient:
          CampaignRecipientRecord
      ) =>
        recipient.contactId
    )
    .filter(
      (
        contactId:
          string
      ) =>
        Boolean(
          contactId
        )
    );

const contactRefs:
  FirebaseFirestore.DocumentReference[] =
  contactIds.map(
    (
      contactId:
        string
    ) =>
      (db as any)
        .doc(
          `agents/${agentId}/magic_touch_contacts/${contactId}`
        )
  );
  
  const contactSnaps =
    await getAllInChunks(
      db,
      contactRefs
    );

  const contactsById =
    new Map<
      string,
      any
    >();

  contactSnaps.forEach(
    (
      snap,
      index
    ) => {
      contactsById.set(
        contactIds[
          index
        ],

        snap.exists
          ? snap.data()
          : null
      );
    }
  );

  const campaignStorageKey =
    normalizeCampaignStorageKey(
      campaignId
    );

  let sentCount =
    0;

  let deliveredCount =
    0;

  let readCount =
    0;

  let repliedCount =
    0;

  let failedCount =
    0;

  let processedCount =
    0;

  const writer =
    (db as any)
      .bulkWriter();

  for (
    const recipient of
    recipients
  ) {
    const contactData =
      contactsById.get(
        recipient.contactId
      );

    const contactCampaignStatus =
      contactData
        ?.engagement
        ?.campaigns
        ?.[campaignStorageKey] ||
      null;

    const effectiveRecord =
      chooseBetterStatusRecord(
        recipient.data,
        contactCampaignStatus
      ) ||
      recipient.data ||
      {};

    const effectiveStatus =
      safeString(
        effectiveRecord
          ?.status
      ).toLowerCase();

    const replied =
      effectiveStatus ===
        "replied" ||
      Boolean(
        effectiveRecord
          ?.repliedAt
      ) ||
      Boolean(
        contactCampaignStatus
          ?.repliedAt
      );

    const read =
      replied ||
      effectiveStatus ===
        "read" ||
      Boolean(
        effectiveRecord
          ?.readAt
      ) ||
      Boolean(
        contactCampaignStatus
          ?.readAt
      );

    const delivered =
      read ||
      effectiveStatus ===
        "delivered" ||
      Boolean(
        effectiveRecord
          ?.deliveredAt
      ) ||
      Boolean(
        contactCampaignStatus
          ?.deliveredAt
      );

    const failed =
      effectiveStatus ===
        "failed" &&
      !delivered &&
      !read &&
      !replied;

    const sent =
      [
        "accepted",
        "sent",
        "delivered",
        "read",
        "replied",
      ].includes(
        effectiveStatus
      ) ||
      Boolean(
        recipient.data
          ?.waMessageId
      ) ||
      Boolean(
        recipient.data
          ?.sentAt
      ) ||
      Boolean(
        contactCampaignStatus
          ?.waMessageId
      ) ||
      Boolean(
        contactCampaignStatus
          ?.sentAt
      );

    if (
      sent
    ) {
      sentCount++;
    }

    if (
      delivered
    ) {
      deliveredCount++;
    }

    if (
      read
    ) {
      readCount++;
    }

    if (
      replied
    ) {
      repliedCount++;
    }

    if (
      failed
    ) {
      failedCount++;
    }

    if (
      sent ||
      failed
    ) {
      processedCount++;
    }

    /*
     * Backfill ל-recipient:
     * כך אחרי ה-recalculate גם מסמכי הנמענים
     * משקפים את הסטטוס המתקדם ביותר.
     */
    const recipientPatch:
      Record<
        string,
        any
      > = {
        updatedAt:
          effectiveRecord
            ?.updatedAt ||
          recipient.data
            ?.updatedAt ||
          nowTs(),
      };

    if (
      effectiveStatus
    ) {
      recipientPatch.status =
        effectiveStatus;
    }

    if (
      effectiveRecord
        ?.deliveredAt ||
      contactCampaignStatus
        ?.deliveredAt
    ) {
      recipientPatch.deliveredAt =
        effectiveRecord
          ?.deliveredAt ||
        contactCampaignStatus
          ?.deliveredAt;
    }

    if (
      effectiveRecord
        ?.readAt ||
      contactCampaignStatus
        ?.readAt
    ) {
      recipientPatch.readAt =
        effectiveRecord
          ?.readAt ||
        contactCampaignStatus
          ?.readAt;
    }

    if (
      effectiveRecord
        ?.repliedAt ||
      contactCampaignStatus
        ?.repliedAt
    ) {
      recipientPatch.repliedAt =
        effectiveRecord
          ?.repliedAt ||
        contactCampaignStatus
          ?.repliedAt;
    }

    if (
      effectiveRecord
        ?.failedAt ||
      contactCampaignStatus
        ?.failedAt
    ) {
      recipientPatch.failedAt =
        effectiveRecord
          ?.failedAt ||
        contactCampaignStatus
          ?.failedAt;
    }

    if (
      effectiveRecord
        ?.waMessageId ||
      contactCampaignStatus
        ?.waMessageId
    ) {
      recipientPatch.waMessageId =
        effectiveRecord
          ?.waMessageId ||
        contactCampaignStatus
          ?.waMessageId;
    }

    writer.set(
      recipient.ref,
      recipientPatch,
      {
        merge:
          true,
      }
    );
  }

  writer.set(
    campaignRef,
    {
      totalContacts:
        recipients.length,

      sentCount,

      deliveredCount,

      readCount,

      repliedCount,

      failedCount,

      processedCount,

      statsRecalculatedAt:
        nowTs(),

      updatedAt:
        nowTs(),
    },
    {
      merge:
        true,
    }
  );

  await writer.close();

  console.log(
    "[recalculateMagicTouchCampaignStats] Campaign stats recalculated",
    {
      agentId,

      campaignId,

      totalContacts:
        recipients.length,

      sentCount,

      deliveredCount,

      readCount,

      repliedCount,

      failedCount,

      processedCount,
    }
  );

  return {
    ok:
      true,

    agentId,

    campaignId,

    totalContacts:
      recipients.length,

    sentCount,

    deliveredCount,

    readCount,

    repliedCount,

    failedCount,

    processedCount,
  };
}

export async function mergeMagicTouchCampaignsImpl(
  req: any
): Promise<object> {
  const {
    db,
    authUid,
    agentId,
    userData,
  } =
    await resolveAgentAccess(
      req
    );

  const sourceCampaignIds:
    string[] =
    Array.from(
      new Set<string>(
        (
          Array.isArray(
            req.data?.sourceCampaignIds
          )
            ? req.data.sourceCampaignIds
            : []
        )
          .map(
            (
              value: unknown
            ): string =>
              safeString(
                value
              )
          )
          .filter(
            (
              value: string
            ) =>
              Boolean(
                value
              )
          )
      )
    );

  const requestedTargetCampaignId =
    safeString(
      req.data
        ?.targetCampaignId
    );

  const requestedTargetCampaignName =
    safeString(
      req.data
        ?.targetCampaignName
    );

  if (
    sourceCampaignIds.length ===
    0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Select at least one source campaign"
    );
  }

  if (
    sourceCampaignIds.length >
    100
  ) {
    throw new HttpsError(
      "invalid-argument",
      "A maximum of 100 campaigns can be merged at once"
    );
  }

  if (
    requestedTargetCampaignId &&
    sourceCampaignIds.includes(
      requestedTargetCampaignId
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Target campaign cannot also be a source campaign"
    );
  }

  const campaignsCollection =
    (db as any)
      .collection(
        `agents/${agentId}/magic_touch_campaigns`
      );

  const sourceRefs =
    sourceCampaignIds.map(
      (
        campaignId
      ) =>
        campaignsCollection
          .doc(
            campaignId
          )
    );

  const sourceSnaps =
    await getAllInChunks(
      db,
      sourceRefs
    );

  const missingSourceIds:
    string[] =
    [];

  const sourceCampaigns =
    sourceSnaps
      .map(
        (
          snap,
          index
        ) => {
          if (
            !snap.exists
          ) {
            missingSourceIds.push(
              sourceCampaignIds[
                index
              ]
            );

            return null;
          }

          return {
            campaignId:
              sourceCampaignIds[
                index
              ],

            ref:
              sourceRefs[
                index
              ],

            data:
              snap.data() as any,
          };
        }
      )
      .filter(
        Boolean
      ) as Array<{
        campaignId: string;
        ref:
          FirebaseFirestore.DocumentReference;
        data: any;
      }>;

  if (
    missingSourceIds.length >
    0
  ) {
    throw new HttpsError(
      "not-found",
      `Campaigns not found: ${missingSourceIds.join(", ")}`
    );
  }

  for (
    const source of
    sourceCampaigns
  ) {
    const status =
      safeString(
        source.data
          ?.status
      );

    if (
      status ===
      "merged"
    ) {
      throw new HttpsError(
        "failed-precondition",
        `Campaign ${source.campaignId} was already merged`
      );
    }
  }

  const templateNames =
    Array.from(
      new Set(
        sourceCampaigns
          .map(
            (
              source
            ) =>
              safeString(
                source.data
                  ?.templateName
              )
          )
          .filter(
            Boolean
          )
      )
    );

  if (
    templateNames.length !==
    1
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Only campaigns that use the same WhatsApp template can be merged"
    );
  }

  const templateName =
    templateNames[0];

  let targetCampaignRef:
    FirebaseFirestore.DocumentReference;

  let targetCampaignData:
    any =
    null;

  let targetCampaignId:
    string;

  let createdTargetCampaign =
    false;

  if (
    requestedTargetCampaignId
  ) {
    targetCampaignRef =
      campaignsCollection
        .doc(
          requestedTargetCampaignId
        );

    const targetSnap =
      await targetCampaignRef
        .get();

    if (
      !targetSnap.exists
    ) {
      throw new HttpsError(
        "not-found",
        "Target campaign was not found"
      );
    }

    targetCampaignData =
      targetSnap.data() as any;

    const targetTemplateName =
      safeString(
        targetCampaignData
          ?.templateName
      );

    if (
      targetTemplateName !==
      templateName
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Target campaign uses a different WhatsApp template"
      );
    }

    const targetStatus =
      safeString(
        targetCampaignData
          ?.status
      );

    if (
      targetStatus ===
        "merged" ||
      targetStatus ===
        "archived"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Merged or archived campaign cannot be used as a target"
      );
    }

    targetCampaignId =
      requestedTargetCampaignId;
  } else {
    if (
      !requestedTargetCampaignName
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Missing target campaign name"
      );
    }

    targetCampaignRef =
      campaignsCollection
        .doc();

    targetCampaignId =
      targetCampaignRef.id;

    createdTargetCampaign =
      true;

    targetCampaignData = {
      campaignId:
        targetCampaignId,

      agentId,

      name:
        requestedTargetCampaignName,

      channel:
        "whatsapp",

      templateName,

      status:
        "active",

      totalContacts:
        0,

      sentCount:
        0,

      deliveredCount:
        0,

      readCount:
        0,

      repliedCount:
        0,

      failedCount:
        0,

      processedCount:
        0,

      createdBy:
        authUid,

      createdByName:
        safeString(
          userData?.name
        ) ||
        null,

      startedAt:
        nowTs(),

      completedAt:
        null,

      createdAt:
        nowTs(),

      updatedAt:
        nowTs(),

      migrationCreated:
        true,
    };

    await targetCampaignRef
      .set(
        targetCampaignData
      );
  }

  const sourceRecipientSnapshots:
    Array<{
      sourceCampaignId:
        string;

      doc:
        FirebaseFirestore.QueryDocumentSnapshot;
    }> =
    [];

  for (
    const source of
    sourceCampaigns
  ) {
    const recipientsSnap =
      await source.ref
        .collection(
          "recipients"
        )
        .get();

    for (
      const recipientDoc of
      recipientsSnap.docs
    ) {
      sourceRecipientSnapshots.push({
        sourceCampaignId:
          source.campaignId,

        doc:
          recipientDoc,
      });
    }
  }

  const targetRecipientsSnap =
    await targetCampaignRef
      .collection(
        "recipients"
      )
      .get();

  const mergedRecipientMap =
    new Map<
      string,
      any
    >();

  for (
    const targetRecipientDoc of
    targetRecipientsSnap.docs
  ) {
    const data =
      targetRecipientDoc.data() as any;

    mergedRecipientMap.set(
      targetRecipientDoc.id,
      {
        ...data,

        contactId:
          safeString(
            data?.contactId
          ) ||
          targetRecipientDoc.id,

        campaignId:
          targetCampaignId,
      }
    );
  }

  for (
    const sourceRecipient of
    sourceRecipientSnapshots
  ) {
    const data =
      sourceRecipient
        .doc
        .data() as any;

    const contactId =
      safeString(
        data?.contactId
      ) ||
      sourceRecipient
        .doc.id;

    if (
      !contactId
    ) {
      continue;
    }

    const current =
      mergedRecipientMap.get(
        contactId
      );

    const candidate = {
      ...data,

      contactId,

      campaignId:
        targetCampaignId,

      mergedFromCampaignId:
        sourceRecipient
          .sourceCampaignId,
    };

    mergedRecipientMap.set(
      contactId,
      chooseBetterStatusRecord(
        current,
        candidate
      )
    );
  }

  const uniqueContactIds =
    Array.from(
      mergedRecipientMap.keys()
    );

  const contactRefs =
    uniqueContactIds.map(
      (
        contactId
      ) =>
        (db as any)
          .doc(
            `agents/${agentId}/magic_touch_contacts/${contactId}`
          )
    );

  const contactSnaps =
    await getAllInChunks(
      db,
      contactRefs
    );

  const contactsById =
    new Map<
      string,
      any
    >();

  contactSnaps.forEach(
    (
      snap,
      index
    ) => {
      contactsById.set(
        uniqueContactIds[
          index
        ],

        snap.exists
          ? snap.data()
          : null
      );
    }
  );

  const conversationIds =
    Array.from(
      new Set(
        Array.from(
          mergedRecipientMap.values()
        )
          .map(
            (
              recipient
            ) =>
              safeString(
                recipient
                  ?.conversationId
              )
          )
          .filter(
            Boolean
          )
      )
    );

  const conversationRefs =
    conversationIds.map(
      (
        conversationId
      ) =>
        (db as any)
          .doc(
            `whatsapp_conversations/${conversationId}`
          )
    );

  const conversationSnaps =
    await getAllInChunks(
      db,
      conversationRefs
    );

  const conversationsById =
    new Map<
      string,
      any
    >();

  conversationSnaps.forEach(
    (
      snap,
      index
    ) => {
      conversationsById.set(
        conversationIds[
          index
        ],

        snap.exists
          ? snap.data()
          : null
      );
    }
  );

  const sourceIdSet =
    new Set(
      sourceCampaignIds
    );

  const targetCampaignStorageKey =
    normalizeCampaignStorageKey(
      targetCampaignId
    );

  const writer =
    (db as any)
      .bulkWriter();

  let sentCount =
    0;

  let failedCount =
    0;

  let processedCount =
    0;

  let deliveredCount =
    0;

  let readCount =
    0;

  let repliedCount =
    0;

  for (
    const [
      contactId,
      recipient,
    ] of
    mergedRecipientMap.entries()
  ) {
    const status =
      safeString(
        recipient?.status
      ).toLowerCase();

    if (
      [
        "accepted",
        "sent",
        "delivered",
        "read",
        "replied",
      ].includes(
        status
      )
    ) {
      sentCount++;
      processedCount++;
    } else if (
      status ===
      "failed"
    ) {
      failedCount++;
      processedCount++;
    }

    if (
      [
        "delivered",
        "read",
        "replied",
      ].includes(
        status
      )
    ) {
      deliveredCount++;
    }

    if (
      [
        "read",
        "replied",
      ].includes(
        status
      )
    ) {
      readCount++;
    }

    if (
      status ===
      "replied"
    ) {
      repliedCount++;
    }

    const targetRecipientRef =
      targetCampaignRef
        .collection(
          "recipients"
        )
        .doc(
          contactId
        );

    writer.set(
      targetRecipientRef,
      {
        ...recipient,

        agentId,

        campaignId:
          targetCampaignId,

        contactId,

        templateName,

        mergedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    const contactData =
      contactsById.get(
        contactId
      );

    if (
      contactData
    ) {
      const campaigns =
        contactData
          ?.engagement
          ?.campaigns &&
        typeof contactData
          .engagement
          .campaigns ===
          "object"
          ? contactData
              .engagement
              .campaigns
          : {};

      let bestCampaignStatus =
        campaigns[
          targetCampaignStorageKey
        ] ||
        null;

      for (
        const sourceCampaignId of
        sourceCampaignIds
      ) {
        const sourceKey =
          normalizeCampaignStorageKey(
            sourceCampaignId
          );

        bestCampaignStatus =
          chooseBetterStatusRecord(
            bestCampaignStatus,
            campaigns[
              sourceKey
            ]
          );
      }

      if (
        !bestCampaignStatus
      ) {
        bestCampaignStatus = {
          campaignId:
            targetCampaignId,

          campaignSource:
            "campaign",

          templateName,

          status:
            status ||
            null,

          waMessageId:
            safeString(
              recipient
                ?.waMessageId
            ) ||
            null,

          conversationId:
            safeString(
              recipient
                ?.conversationId
            ) ||
            null,

          sentAt:
            recipient
              ?.sentAt ||
            null,

          deliveredAt:
            recipient
              ?.deliveredAt ||
            null,

          readAt:
            recipient
              ?.readAt ||
            null,

          repliedAt:
            recipient
              ?.repliedAt ||
            null,

          failedAt:
            recipient
              ?.failedAt ||
            null,

          updatedAt:
            recipient
              ?.updatedAt ||
            recipient
              ?.sentAt ||
            null,
        };
      } else {
        bestCampaignStatus = {
          ...bestCampaignStatus,

          campaignId:
            targetCampaignId,

          campaignSource:
            "campaign",

          templateName:
            safeString(
              bestCampaignStatus
                ?.templateName
            ) ||
            templateName,
        };
      }

      const contactUpdate:
        Record<
          string,
          any
        > = {
          [`engagement.campaigns.${targetCampaignStorageKey}`]:
            bestCampaignStatus,
        };

      for (
        const sourceCampaignId of
        sourceCampaignIds
      ) {
        const sourceKey =
          normalizeCampaignStorageKey(
            sourceCampaignId
          );

        if (
          sourceKey !==
          targetCampaignStorageKey
        ) {
          contactUpdate[
            `engagement.campaigns.${sourceKey}`
          ] =
            FieldValue.delete();
        }
      }

      if (
        sourceIdSet.has(
          safeString(
            contactData
              ?.lastCampaignId
          )
        )
      ) {
        contactUpdate.lastCampaignId =
          targetCampaignId;
      }

      writer.update(
        contactRefs[
          uniqueContactIds
            .indexOf(
              contactId
            )
        ],
        contactUpdate
      );
    }

    const conversationId =
      safeString(
        recipient
          ?.conversationId
      );

    const waMessageId =
      safeString(
        recipient
          ?.waMessageId
      );

    if (
      conversationId &&
      waMessageId
    ) {
      const messageRef =
        (db as any)
          .doc(
            `whatsapp_conversations/${conversationId}/messages/${waMessageId}`
          );

      writer.set(
        messageRef,
        {
          campaignId:
            targetCampaignId,

          campaignSource:
            "campaign",
        },
        {
          merge:
            true,
        }
      );
    }

    if (
      conversationId
    ) {
      const conversationData =
        conversationsById.get(
          conversationId
        );

      if (
        conversationData &&
        sourceIdSet.has(
          safeString(
            conversationData
              ?.lastCampaignId
          )
        )
      ) {
        writer.set(
          (db as any)
            .doc(
              `whatsapp_conversations/${conversationId}`
            ),
          {
            lastCampaignId:
              targetCampaignId,

            updatedAt:
              conversationData
                ?.updatedAt ||
              nowTs(),
          },
          {
            merge:
              true,
          }
        );
      }
    }
  }

  writer.set(
    targetCampaignRef,
    {
      campaignId:
        targetCampaignId,

      agentId,

      name:
        requestedTargetCampaignId
          ? safeString(
              targetCampaignData
                ?.name
            ) ||
            requestedTargetCampaignName ||
            templateName
          : requestedTargetCampaignName,

      channel:
        "whatsapp",

      templateName,

      status:
        "active",

      completedAt:
        null,

      totalContacts:
        mergedRecipientMap.size,

      sentCount,

      failedCount,

      processedCount,

      deliveredCount,

      readCount,

      repliedCount,

      mergedSourceCampaignIds:
        FieldValue.arrayUnion(
          ...sourceCampaignIds
        ),

      lastMergeAt:
        nowTs(),

      updatedAt:
        nowTs(),
    },
    {
      merge:
        true,
    }
  );

  for (
    const source of
    sourceCampaigns
  ) {
    writer.set(
      source.ref,
      {
        status:
          "merged",

        mergedIntoCampaignId:
          targetCampaignId,

        mergedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );
  }

  await writer.close();

  console.log(
    "[mergeMagicTouchCampaigns] Campaigns merged",
    {
      agentId,

      targetCampaignId,

      createdTargetCampaign,

      sourceCampaignIds,

      templateName,

      totalContacts:
        mergedRecipientMap.size,

      sentCount,

      failedCount,

      deliveredCount,

      readCount,

      repliedCount,

      mergedBy:
        authUid,
    }
  );

  return {
    ok:
      true,

    agentId,

    targetCampaignId,

    createdTargetCampaign,

    templateName,

    sourceCampaignIds,

    mergedCampaignCount:
      sourceCampaignIds.length,

    totalContacts:
      mergedRecipientMap.size,

    sentCount,

    failedCount,

    processedCount,

    deliveredCount,

    readCount,

    repliedCount,
  };
}

export async function sendMagicTouchWhatsAppCampaignImpl(
  req: any
): Promise<object> {
  const {
    db,
    authUid,
    agentId,
    userData,
  } =
    await resolveAgentAccess(
      req
    );

  const requestedCampaignId =
    safeString(
      req.data?.campaignId
    );

  const requestedTemplateName =
    safeString(
      req.data?.templateName
    );

  const requestedCampaignName =
    safeString(
      req.data?.campaignName
    );

  const contactIds =
    normalizeContactIds(
      req.data?.contactIds
    );

  if (
    contactIds.length ===
    0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing contactIds"
    );
  }

  if (
    contactIds.length >
    MAX_CONTACTS_PER_BATCH
  ) {
    throw new HttpsError(
      "invalid-argument",
      `A maximum of ${MAX_CONTACTS_PER_BATCH} contacts is allowed per batch`
    );
  }

  if (
    requestedCampaignId &&
    requestedCampaignId.includes(
      "/"
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid campaignId"
    );
  }

  const campaignsCollection =
    (db as any)
      .collection(
        `agents/${agentId}/magic_touch_campaigns`
      );

  const campaignRef =
    requestedCampaignId
      ? campaignsCollection
          .doc(
            requestedCampaignId
          )
      : campaignsCollection
          .doc();

  const campaignId =
    campaignRef.id;

  let existingCampaign:
    any =
    null;

  let templateName =
    requestedTemplateName;

  let finalCampaignName =
    requestedCampaignName;

  let baseTotalContacts =
    0;

  let baseSentCount =
    0;

  let baseFailedCount =
    0;

  let baseProcessedCount =
    0;

  if (
    requestedCampaignId
  ) {
    const campaignSnap =
      await campaignRef.get();

    if (
      !campaignSnap.exists
    ) {
      throw new HttpsError(
        "not-found",
        "Campaign not found"
      );
    }

    existingCampaign =
      campaignSnap.data() as any;

    const storedAgentId =
      safeString(
        existingCampaign
          ?.agentId
      );

    if (
      storedAgentId &&
      storedAgentId !==
        agentId
    ) {
      throw new HttpsError(
        "permission-denied",
        "Campaign belongs to another agent"
      );
    }

    const storedStatus =
      safeString(
        existingCampaign
          ?.status
      );

    if (
      storedStatus ===
      "archived"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Archived campaign cannot receive new recipients"
      );
    }

    templateName =
      safeString(
        existingCampaign
          ?.templateName
      );

    if (
      !templateName
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Campaign does not have a WhatsApp template"
      );
    }

    if (
      requestedTemplateName &&
      requestedTemplateName !==
        templateName
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Campaign template cannot be changed"
      );
    }

    finalCampaignName =
      safeString(
        existingCampaign
          ?.name
      ) ||
      templateName;

    baseTotalContacts =
      n(
        existingCampaign
          ?.totalContacts
      );

    baseSentCount =
      n(
        existingCampaign
          ?.sentCount
      );

    baseFailedCount =
      n(
        existingCampaign
          ?.failedCount
      );

    baseProcessedCount =
      n(
        existingCampaign
          ?.processedCount
      );
  } else {
    if (
      !templateName
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Missing templateName"
      );
    }

    finalCampaignName =
      finalCampaignName ||
      `קמפיין WhatsApp ${new Date().toLocaleDateString("he-IL")}`;
  }

  const recipientSnapshots =
    await Promise.all(
      contactIds.map(
        async (
          contactId
        ) => {
          const recipientRef =
            campaignRef
              .collection(
                "recipients"
              )
              .doc(
                contactId
              );

          const snapshot =
            requestedCampaignId
              ? await recipientRef
                  .get()
              : null;

          return {
            contactId,

            recipientRef,

            exists:
              Boolean(
                snapshot
                  ?.exists
              ),
          };
        }
      )
    );

  const newRecipients =
    recipientSnapshots
      .filter(
        (
          item
        ) =>
          !item.exists
      );

  const skippedRecipients =
    recipientSnapshots
      .filter(
        (
          item
        ) =>
          item.exists
      );

  const results:
    CampaignResultItem[] =
    skippedRecipients.map(
      (
        item
      ) => ({
        contactId:
          item.contactId,

        ok:
          true,

        skipped:
          true,

        skipReason:
          "already_in_campaign",
      })
    );

  if (
    requestedCampaignId &&
    newRecipients.length ===
      0
  ) {
    return {
      ok:
        true,

      partialSuccess:
        false,

      agentId,

      campaignId,

      campaignName:
        finalCampaignName,

      templateName,

      received:
        contactIds.length,

      added:
        0,

      skipped:
        skippedRecipients.length,

      sent:
        0,

      failed:
        0,

      totalContacts:
        baseTotalContacts,

      totalSent:
        baseSentCount,

      totalFailed:
        baseFailedCount,

      totalProcessed:
        baseProcessedCount,

      status:
        "completed",

      campaignStatus:
        "active",

      lastBatchStatus:
        "completed",

      results,
    };
  }

  const newTotalContacts =
    requestedCampaignId
      ? baseTotalContacts +
        newRecipients.length
      : newRecipients.length;

  if (
    requestedCampaignId
  ) {
    await campaignRef.set(
      {
        status:
          "active",

        completedAt:
          null,

        totalContacts:
          newTotalContacts,

        lastBatchStatus:
          "processing",

        lastBatchStartedAt:
          nowTs(),

        lastBatchSize:
          newRecipients.length,

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );
  } else {
    await campaignRef.set({
      campaignId,

      agentId,

      name:
        finalCampaignName,

      channel:
        "whatsapp",

      templateName,

      status:
        "active",

      totalContacts:
        newTotalContacts,

      sentCount:
        0,

      deliveredCount:
        0,

      readCount:
        0,

      repliedCount:
        0,

      failedCount:
        0,

      processedCount:
        0,

      createdBy:
        authUid,

      createdByName:
        safeString(
          userData?.name
        ) ||
        null,

      startedAt:
        nowTs(),

      lastBatchStatus:
        "processing",

      lastBatchStartedAt:
        nowTs(),

      lastBatchSize:
        newRecipients.length,

      completedAt:
        null,

      createdAt:
        nowTs(),

      updatedAt:
        nowTs(),
    });
  }

  let context;

  try {
    context =
      await loadMagicTouchWhatsAppTemplateContext({
        db:
          db as any,

        agentId,

        templateName,
      });
  } catch (
    error: any
  ) {
    const errorMessage =
      error?.message ||
      String(
        error
      );

    await campaignRef.set(
      {
        status:
          "active",

        lastBatchStatus:
          "failed",

        lastBatchError:
          errorMessage,

        lastBatchFailedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    throw error;
  }

  let sentThisBatch =
    0;

  let failedThisBatch =
    0;

  for (
    const recipient of
    newRecipients
  ) {
    const {
      contactId,
      recipientRef,
    } =
      recipient;

    await recipientRef.set(
      {
        campaignId,

        agentId,

        contactId,

        status:
          "processing",

        templateName,

        createdAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    try {
      const result =
        await sendMagicTouchTemplateToContact({
          db:
            db as any,

          context,

          contactId,

          createdBy:
            authUid,

          campaignId,
        });

      sentThisBatch++;

      await recipientRef.set(
        {
          status:
            "accepted",

          phoneNormalized:
            result
              .phoneNormalized,

          conversationId:
            result
              .conversationId,

          waMessageId:
            result
              .waMessageId,

          timelineEventId:
            result
              .timelineEventId,

          sentAt:
            nowTs(),

          error:
            null,

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      );

      results.push({
        contactId,

        ok:
          true,

        waMessageId:
          result
            .waMessageId,

        conversationId:
          result
            .conversationId,
      });
    } catch (
      error: any
    ) {
      failedThisBatch++;

      const errorMessage =
        error?.message ||
        String(
          error
        );

      console.error(
        "[sendMagicTouchWhatsAppCampaign] Recipient failed",
        {
          agentId,

          campaignId,

          contactId,

          error:
            errorMessage,
        }
      );

      await recipientRef.set(
        {
          status:
            "failed",

          error:
            errorMessage,

          failedAt:
            nowTs(),

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      );

      results.push({
        contactId,

        ok:
          false,

        error:
          errorMessage,
      });
    }

    await campaignRef.set(
      {
        sentCount:
          baseSentCount +
          sentThisBatch,

        failedCount:
          baseFailedCount +
          failedThisBatch,

        processedCount:
          baseProcessedCount +
          sentThisBatch +
          failedThisBatch,

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );
  }

  const totalSent =
    baseSentCount +
    sentThisBatch;

  const totalFailed =
    baseFailedCount +
    failedThisBatch;

  const totalProcessed =
    baseProcessedCount +
    sentThisBatch +
    failedThisBatch;

  const batchStatus =
    failedThisBatch ===
      0
      ? "completed"
      : sentThisBatch >
          0
        ? "completed_with_errors"
        : "failed";

  await campaignRef.set(
    {
      status:
        "active",

      completedAt:
        null,

      totalContacts:
        newTotalContacts,

      sentCount:
        totalSent,

      failedCount:
        totalFailed,

      processedCount:
        totalProcessed,

      lastBatchStatus:
        batchStatus,

      lastBatchSentCount:
        sentThisBatch,

      lastBatchFailedCount:
        failedThisBatch,

      lastBatchCompletedAt:
        nowTs(),

      lastBatchError:
        null,

      updatedAt:
        nowTs(),
    },
    {
      merge:
        true,
    }
  );

  return {
    ok:
      failedThisBatch ===
      0,

    partialSuccess:
      sentThisBatch >
        0 &&
      failedThisBatch >
        0,

    agentId,

    campaignId,

    campaignName:
      finalCampaignName,

    templateName,

    received:
      contactIds.length,

    added:
      newRecipients.length,

    skipped:
      skippedRecipients.length,

    sent:
      sentThisBatch,

    failed:
      failedThisBatch,

    totalContacts:
      newTotalContacts,

    totalSent,

    totalFailed,

    totalProcessed,

    status:
      batchStatus,

    campaignStatus:
      "active",

    lastBatchStatus:
      batchStatus,

    results,
  };
}