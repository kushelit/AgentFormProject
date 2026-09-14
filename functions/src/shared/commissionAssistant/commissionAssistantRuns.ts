/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  nowTs,
} from "../admin";

import type {
  CommissionAssistantCompany,
} from "./commissionAssistantCompanies";

const RUNNER_ONLINE_MAX_AGE_MS =
  30 *
  1000;

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function timestampToMillis(
  value: any
): number | null {
  if (
    !value
  ) {
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

export type CommissionAssistantRunnerReadiness = {
  state:
    | "ready"
    | "offline"
    | "update_required";
  runnerId: string;
  currentVersion: string;
  latestVersion: string;
  installerUrl: string;
  lastSeenAtMs: number | null;
};

export async function getCommissionAssistantRunnerReadiness({
  db,
  requesterAgentId,
}: {
  db: FirebaseFirestore.Firestore;
  requesterAgentId: string;
}): Promise<CommissionAssistantRunnerReadiness> {
  const [
    statusSnap,
    configSnap,
  ] = await Promise.all([
    db
      .doc(
        `portalRunnerStatus/${requesterAgentId}`
      )
      .get(),

    db
      .doc(
        "portalRunnerConfig/global"
      )
      .get(),
  ]);

  const statusData =
    statusSnap.exists
      ? statusSnap.data() as any
      : {};

  const configData =
    configSnap.exists
      ? configSnap.data() as any
      : {};

  const runnerId =
    s(
      statusData?.runnerId
    );

  const currentVersion =
    s(
      statusData?.runnerVersion
    );

  const latestVersion =
    s(
      configData?.latestVersion
    );

  const installerUrl =
    s(
      configData?.installerUrl
    );

  const lastSeenAtMs =
    timestampToMillis(
      statusData?.lastSeenAt
    );

  const online =
    Boolean(
      runnerId &&
      lastSeenAtMs &&
      Date.now() -
        lastSeenAtMs <
        RUNNER_ONLINE_MAX_AGE_MS
    );

  if (
    !online
  ) {
    return {
      state:
        "offline",
      runnerId,
      currentVersion,
      latestVersion,
      installerUrl,
      lastSeenAtMs,
    };
  }

  if (
    latestVersion &&
    currentVersion !==
      latestVersion
  ) {
    return {
      state:
        "update_required",
      runnerId,
      currentVersion,
      latestVersion,
      installerUrl,
      lastSeenAtMs,
    };
  }

  return {
    state:
      "ready",
    runnerId,
    currentVersion,
    latestVersion,
    installerUrl,
    lastSeenAtMs,
  };
}

export async function ensureCommissionAssistantSelfUpdateRun({
  db,
  requesterAgentId,
  sessionId,
  runnerId,
  installerUrl,
  targetVersion,
  conversationId,
}: {
  db: FirebaseFirestore.Firestore;
  requesterAgentId: string;
  sessionId: string;
  runnerId: string;
  installerUrl: string;
  targetVersion: string;
  conversationId: string;
}): Promise<string> {
  if (
    !runnerId ||
    !installerUrl
  ) {
    throw new Error(
      "COMMISSION_ASSISTANT_UPDATE_NOT_AVAILABLE"
    );
  }

  const safeSessionId =
    sessionId.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );

  const runId =
    `commission_update_${safeSessionId}`;

  const runRef =
    db.doc(
      `portalImportRuns/${runId}`
    );

  await db.runTransaction(
    async (
      transaction
    ) => {
      const snap =
        await transaction.get(
          runRef
        );

      const existing =
        snap.exists
          ? snap.data() as any
          : null;

      const existingStatus =
        s(
          existing?.status
        );

      if (
        snap.exists &&
        ![
          "error",
          "failed",
        ].includes(
          existingStatus
        )
      ) {
        return;
      }

      const timestamp =
        nowTs();

      transaction.set(
        runRef,
        {
          agentId:
            requesterAgentId,

          status:
            "queued",

          step:
            "queued",

          automationClass:
            "self_update",

          installerUrl,

          targetVersion:
            targetVersion ||
            null,

          reservedRunnerId:
            runnerId,

          source:
            "portalRunner",

          triggeredFrom:
            "commission_assistant",

          commissionAssistantSessionId:
            sessionId,

          conversationId,

          error:
            null,

          createdAt:
            existing?.createdAt ||
            timestamp,

          updatedAt:
            timestamp,
        },
        {
          merge:
            true,
        }
      );
    }
  );

  return runId;
}

export type CreateCommissionAssistantBatchResult = {
  batchId: string;
  runIds: string[];
  alreadyExisted: boolean;
};

export async function createCommissionAssistantBatch({
  db,
  requesterAgentId,
  whatsappAgentId,
  conversationId,
  sessionId,
  selectedCompanies,
  reservedRunnerId,
}: {
  db: FirebaseFirestore.Firestore;
  requesterAgentId: string;
  whatsappAgentId: string;
  conversationId: string;
  sessionId: string;
  selectedCompanies: CommissionAssistantCompany[];
  reservedRunnerId: string;
}): Promise<CreateCommissionAssistantBatchResult> {
  if (
    selectedCompanies.length ===
      0
  ) {
    throw new Error(
      "COMMISSION_ASSISTANT_NO_SELECTED_COMPANIES"
    );
  }

  if (
    !reservedRunnerId
  ) {
    throw new Error(
      "COMMISSION_ASSISTANT_RUNNER_ID_MISSING"
    );
  }

  const safeSessionId =
    sessionId.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );

  const batchId =
    `commission_${safeSessionId}`;

  const runIds =
    selectedCompanies.map(
      (
        _company,
        index
      ) =>
        `${batchId}_${String(
          index + 1
        ).padStart(
          2,
          "0"
        )}`
    );

  const batchRef =
    db.doc(
      `portalRunBatches/${batchId}`
    );

  let alreadyExisted =
    false;

  await db.runTransaction(
    async (
      transaction
    ) => {
      const existingBatchSnap =
        await transaction.get(
          batchRef
        );

      if (
        existingBatchSnap.exists
      ) {
        alreadyExisted =
          true;
        return;
      }

      const timestamp =
        nowTs();

      transaction.set(
        batchRef,
        {
          batchId,

          agentId:
            requesterAgentId,

          status:
            "queued",

          mode:
            "sequential",

          companyIds:
            selectedCompanies.map(
              (
                company
              ) =>
                company.id
            ),

          companyNames:
            selectedCompanies.map(
              (
                company
              ) =>
                company.name
            ),

          reservedRunnerId,

          totalCount:
            selectedCompanies.length,

          doneCount:
            0,

          errorCount:
            0,

          source:
            "portalRunner",

          triggeredFrom:
            "commission_assistant",

          commissionAssistantSessionId:
            sessionId,

          conversationId,

          whatsappAgentId,

          createdAt:
            timestamp,

          updatedAt:
            timestamp,
        }
      );

      selectedCompanies.forEach(
        (
          company,
          index
        ) => {
          const runId =
            runIds[
              index
            ];

          const runRef =
            db.doc(
              `portalImportRuns/${runId}`
            );

          const portalId =
            s(
              company.portalId
            ) ||
            company.id;

          transaction.set(
            runRef,
            {
              agentId:
                requesterAgentId,

              companyId:
                company.id,

              companyName:
                company.name,

              templateId:
                `bundle_${portalId}_commissions`,

              automationClass:
                company.companyAutomationClass,

              monthLabel:
                "previous_month",

              status:
                "queued",

              step:
                "queued",

              otp: {
                mode:
                  "firestore",

                state:
                  "none",

                value:
                  "",
              },

              reservedRunnerId,

              batchId,

              batchOrder:
                index +
                1,

              batchTotal:
                selectedCompanies.length,

              source:
                "portalRunner",

              triggeredFrom:
                "commission_assistant",

              commissionAssistantSessionId:
                sessionId,

              conversationId,

              whatsappAgentId,

              createdAt:
                timestamp,

              updatedAt:
                timestamp,
            }
          );
        }
      );
    }
  );

  return {
    batchId,
    runIds,
    alreadyExisted,
  };
}

export type PrepareCommissionAssistantRunResult =
  | {
      state: "batch_created";
      batchId: string;
      runIds: string[];
      runnerId: string;
      runnerVersion: string;
      alreadyExisted: boolean;
    }
  | {
      state: "runner_offline";
      runnerId: string;
      runnerVersion: string;
    }
  | {
      state: "runner_updating";
      runnerId: string;
      currentVersion: string;
      latestVersion: string;
      updateRunId: string;
    }
  | {
      state: "runner_update_unavailable";
      runnerId: string;
      currentVersion: string;
      latestVersion: string;
    };

export async function prepareCommissionAssistantRun({
  db,
  requesterAgentId,
  whatsappAgentId,
  conversationId,
  sessionId,
  selectedCompanies,
}: {
  db: FirebaseFirestore.Firestore;
  requesterAgentId: string;
  whatsappAgentId: string;
  conversationId: string;
  sessionId: string;
  selectedCompanies: CommissionAssistantCompany[];
}): Promise<PrepareCommissionAssistantRunResult> {
  const readiness =
    await getCommissionAssistantRunnerReadiness({
      db,
      requesterAgentId,
    });

  if (
    readiness.state ===
      "offline"
  ) {
    return {
      state:
        "runner_offline",
      runnerId:
        readiness.runnerId,
      runnerVersion:
        readiness.currentVersion,
    };
  }

  if (
    readiness.state ===
      "update_required"
  ) {
    if (
      !readiness.installerUrl
    ) {
      return {
        state:
          "runner_update_unavailable",
        runnerId:
          readiness.runnerId,
        currentVersion:
          readiness.currentVersion,
        latestVersion:
          readiness.latestVersion,
      };
    }

    const updateRunId =
      await ensureCommissionAssistantSelfUpdateRun({
        db,
        requesterAgentId,
        sessionId,
        runnerId:
          readiness.runnerId,
        installerUrl:
          readiness.installerUrl,
        targetVersion:
          readiness.latestVersion,
        conversationId,
      });

    return {
      state:
        "runner_updating",
      runnerId:
        readiness.runnerId,
      currentVersion:
        readiness.currentVersion,
      latestVersion:
        readiness.latestVersion,
      updateRunId,
    };
  }

  const batch =
    await createCommissionAssistantBatch({
      db,
      requesterAgentId,
      whatsappAgentId,
      conversationId,
      sessionId,
      selectedCompanies,
      reservedRunnerId:
        readiness.runnerId,
    });

  return {
    state:
      "batch_created",
    batchId:
      batch.batchId,
    runIds:
      batch.runIds,
    runnerId:
      readiness.runnerId,
    runnerVersion:
      readiness.currentVersion,
    alreadyExisted:
      batch.alreadyExisted,
  };
}
