/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
} from "./shared/admin";

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  requireBackendPermission,
} from "./shared/backendPermissions";

const MAX_CAMPAIGNS_RETURNED =
  100;

const MAX_ACTIVE_CAMPAIGNS_WITH_STATS =
  30;

const MAX_RECIPIENTS_PER_CAMPAIGN =
  5000;

const MAX_FLOW_RUNS_SCANNED =
  500;

const MAX_HUMAN_ATTENTION_ITEMS =
  20;

type AgentAccessContext = {
  db: FirebaseFirestore.Firestore;
  authUid: string;
  agentId: string;
  userData: any;
};

type CampaignStats = {
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  processing: number;
};

function n(
  value: unknown
): number {
  const parsed =
    Number(
      value
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
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

function emptyCampaignStats(): CampaignStats {
  return {
    recipients:
      0,
    sent:
      0,
    delivered:
      0,
    read:
      0,
    replied:
      0,
    failed:
      0,
    processing:
      0,
  };
}

function addCampaignStats(
  left: CampaignStats,
  right: CampaignStats
): CampaignStats {
  return {
    recipients:
      left.recipients +
      right.recipients,

    sent:
      left.sent +
      right.sent,

    delivered:
      left.delivered +
      right.delivered,

    read:
      left.read +
      right.read,

    replied:
      left.replied +
      right.replied,

    failed:
      left.failed +
      right.failed,

    processing:
      left.processing +
      right.processing,
  };
}

function calculateRecipientStats(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): CampaignStats {
  const stats =
    emptyCampaignStats();

  for (
    const doc of
    docs
  ) {
    const data =
      doc.data() as any;

    const status =
      safeString(
        data?.status
      ).toLowerCase();

    stats.recipients++;

    if (
      status ===
        "failed"
    ) {
      stats.failed++;
      continue;
    }

    if (
      status ===
        "processing"
    ) {
      stats.processing++;
      continue;
    }

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
      stats.sent++;
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
      stats.delivered++;
    }

    if (
      [
        "read",
        "replied",
      ].includes(
        status
      )
    ) {
      stats.read++;
    }

    if (
      status ===
        "replied"
    ) {
      stats.replied++;
    }
  }

  return stats;
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
    db: db as any,
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
      "Cannot access dashboard for another agent"
    );
  }

  return {
    db: db as any,
    authUid,
    agentId,
    userData,
  };
}

function serializeCampaign(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  agentId: string
) {
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

    failedCount:
      n(
        data?.failedCount
      ),

    processedCount:
      n(
        data?.processedCount
      ),

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

    completedAt:
      timestampToMillis(
        data?.completedAt
      ),
  };
}

async function loadCampaignStats(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  campaignId: string
): Promise<CampaignStats> {
  const snapshot =
    await (db as any)
      .collection(
        `agents/${agentId}/magic_touch_campaigns/${campaignId}/recipients`
      )
      .limit(
        MAX_RECIPIENTS_PER_CAMPAIGN
      )
      .get();

  return calculateRecipientStats(
    snapshot.docs
  );
}

function getHumanAttentionReason(
  run: any
): string {
  const waitingFor =
    run?.waitingFor ||
    {};

  const context =
    waitingFor?.context ||
    {};

  return (
    safeString(
      context?.reason
    ) ||
    safeString(
      context?.message
    ) ||
    safeString(
      context?.description
    ) ||
    safeString(
      waitingFor?.reason
    ) ||
    safeString(
      run?.lastError
    ) ||
    "נדרשת התערבות אנושית"
  );
}

export async function getMagicTouchDashboardImpl(
  req: any
): Promise<object> {
  const {
    db,
    agentId,
  } =
    await resolveAgentAccess(
      req
    );

  const requestedCampaignId =
    safeString(
      req.data?.campaignId
    );

  const requestedHumanAttentionLimit =
    Number(
      req.data?.humanAttentionLimit ||
      MAX_HUMAN_ATTENTION_ITEMS
    );

  const humanAttentionLimit =
    Number.isFinite(
      requestedHumanAttentionLimit
    )
      ? Math.max(
          1,
          Math.min(
            200,
            Math.floor(
              requestedHumanAttentionLimit
            )
          )
        )
      : MAX_HUMAN_ATTENTION_ITEMS;

  const campaignsSnapshot =
    await (db as any)
      .collection(
        `agents/${agentId}/magic_touch_campaigns`
      )
      .limit(
        MAX_CAMPAIGNS_RETURNED
      )
      .get();

  const campaigns =
    campaignsSnapshot.docs
      .map(
        (
          doc: FirebaseFirestore.QueryDocumentSnapshot
        ) =>
          serializeCampaign(
            doc,
            agentId
          )
      )
      .filter(
        (
          campaign: any
        ) =>
          campaign.status !==
            "merged" &&
          campaign.status !==
            "archived"
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

  const activeCampaigns =
    campaigns
      .filter(
        (
          campaign: any
        ) =>
          campaign.status ===
            "active" ||
          campaign.status ===
            "processing"
      )
      .slice(
        0,
        MAX_ACTIVE_CAMPAIGNS_WITH_STATS
      );

  if (
    requestedCampaignId &&
    !campaigns.some(
      (
        campaign: any
      ) =>
        campaign.campaignId ===
        requestedCampaignId
    )
  ) {
    throw new HttpsError(
      "not-found",
      "Campaign not found"
    );
  }

  const campaignStatsEntries =
    await Promise.all(
      activeCampaigns.map(
        async (
          campaign: any
        ) => [
          campaign.campaignId,
          await loadCampaignStats(
            db,
            agentId,
            campaign.campaignId
          ),
        ] as const
      )
    );

  const campaignStatsMap =
    new Map<
      string,
      CampaignStats
    >(
      campaignStatsEntries
    );

  if (
    requestedCampaignId &&
    !campaignStatsMap.has(
      requestedCampaignId
    )
  ) {
    campaignStatsMap.set(
      requestedCampaignId,
      await loadCampaignStats(
        db,
        agentId,
        requestedCampaignId
      )
    );
  }

  const activeCampaignSummaries =
    activeCampaigns.map(
      (
        campaign: any
      ) => ({
        ...campaign,
        stats:
          campaignStatsMap.get(
            campaign.campaignId
          ) ||
          emptyCampaignStats(),
      })
    );

  let selectedStats =
    emptyCampaignStats();

  let selectedCampaign:
    any =
    null;

  if (
    requestedCampaignId
  ) {
    selectedCampaign =
      campaigns.find(
        (
          campaign: any
        ) =>
          campaign.campaignId ===
          requestedCampaignId
      ) ||
      null;

    selectedStats =
      campaignStatsMap.get(
        requestedCampaignId
      ) ||
      emptyCampaignStats();
  } else {
    for (
      const campaign of
      activeCampaignSummaries
    ) {
      selectedStats =
        addCampaignStats(
          selectedStats,
          campaign.stats
        );
    }
  }

  const flowRunsSnapshot =
    await (db as any)
      .collection(
        `agents/${agentId}/magic_touch_flow_runs`
      )
      .limit(
        MAX_FLOW_RUNS_SCANNED
      )
      .get();

  const humanAttentionRuns =
    flowRunsSnapshot.docs
      .map(
        (
          doc: FirebaseFirestore.QueryDocumentSnapshot
        ) => ({
          id:
            doc.id,
          data:
            doc.data() as any,
        })
      )
      .filter(
        (
          item: any
        ) =>
          safeString(
            item.data
              ?.waitingFor
              ?.type
          ) ===
            "human_attention"
      )
      .sort(
        (
          left: any,
          right: any
        ) =>
          Number(
            timestampToMillis(
              right.data
                ?.updatedAt ||
              right.data
                ?.waitingFor
                ?.startedAt ||
              right.data
                ?.createdAt
            ) ||
            0
          ) -
          Number(
            timestampToMillis(
              left.data
                ?.updatedAt ||
              left.data
                ?.waitingFor
                ?.startedAt ||
              left.data
                ?.createdAt
            ) ||
            0
          )
      );

  const humanAttentionTotal =
    humanAttentionRuns.length;

  const visibleHumanAttentionRuns =
    humanAttentionRuns.slice(
      0,
      humanAttentionLimit
    );

  const contactIds =
    Array.from(
      new Set<string>(
        visibleHumanAttentionRuns
          .map(
            (
              item: any
            ) =>
              safeString(
                item.data
                  ?.contactId
              )
          )
          .filter(Boolean)
      )
    );

  const contactRefs =
    contactIds.map(
      (
        contactId
      ) =>
        (db as any).doc(
          `agents/${agentId}/magic_touch_contacts/${contactId}`
        )
    );

  const contactSnapshots =
    contactRefs.length >
      0
      ? await (db as any)
          .getAll(
            ...contactRefs
          )
      : [];

  const contactsById =
    new Map<
      string,
      any
    >();

  for (
    const contactSnap of
    contactSnapshots
  ) {
    if (
      contactSnap.exists
    ) {
      contactsById.set(
        contactSnap.id,
        contactSnap.data()
      );
    }
  }

  const humanAttentionItems =
    visibleHumanAttentionRuns.map(
      (
        item: any
      ) => {
        const run =
          item.data;

        const contactId =
          safeString(
            run?.contactId
          );

        const contact =
          contactsById.get(
            contactId
          ) ||
          {};

        return {
          runId:
            item.id,

          flowId:
            safeString(
              run?.flowId
            ) ||
            null,

          flowName:
            safeString(
              run?.flowName
            ) ||
            safeString(
              run?.flowSnapshot
                ?.name
            ) ||
            null,

          currentStepId:
            safeString(
              run?.currentStepId
            ) ||
            null,

          contactId:
            contactId ||
            null,

          contactName:
            safeString(
              contact?.fullName
            ) ||
            safeString(
              run?.contactName
            ) ||
            "איש קשר",

          phone:
            safeString(
              contact?.phone
            ) ||
            safeString(
              contact?.phoneNormalized
            ) ||
            null,

          reason:
            getHumanAttentionReason(
              run
            ),

          waitingSince:
            timestampToMillis(
              run?.waitingFor
                ?.startedAt ||
              run?.updatedAt ||
              run?.createdAt
            ),
        };
      }
    );

  return {
    ok:
      true,

    agentId,

    scope:
      requestedCampaignId
        ? "campaign"
        : "active_campaigns",

    selectedCampaignId:
      requestedCampaignId ||
      null,

    selectedCampaign,

    activeCampaignCount:
      activeCampaigns.length,

    stats:
      selectedStats,

    campaigns:
      activeCampaignSummaries,

    humanAttention: {
      total:
        humanAttentionTotal,

      items:
        humanAttentionItems,
    },
  };
}
