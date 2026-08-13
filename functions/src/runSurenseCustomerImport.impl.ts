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
  loadSurenseIntegrationConfig,
} from "./shared/surenseIntegrationConfig";

import {
  getSurenseCapabilityConfig,
} from "./shared/surenseSystemConfig";

import {
  importSurenseCustomersDirect,
} from "./shared/importSurenseCustomersDirect";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function safeInt(
  value: unknown,
  fallback: number
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
    return fallback;
  }

  return Math.floor(
    parsed
  );
}

async function assertCanManageAgent(
  input: {
    requestedBy: string;
    agentId: string;
  }
): Promise<void> {
  const db =
    adminDb();

  const requesterSnap =
    await (
      db as any
    )
      .doc(
        `users/${input.requestedBy}`
      )
      .get();

  if (!requesterSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const requester =
    requesterSnap.data() as any;

  const isSystem =
    requester
      ?.isSystem ===
      true;

  const isAdmin =
    requester
      ?.role ===
      "admin";

  const loggedInAgentId =
    s(
      requester
        ?.agentId ||
      input.requestedBy
    );

  const canManageAgent =
    isSystem ||
    isAdmin ||
    loggedInAgentId ===
      input.agentId;

  if (!canManageAgent) {
    throw new HttpsError(
      "permission-denied",
      "You may only run Surense import for your own agent"
    );
  }
}

export async function runSurenseCustomerImportImpl(
  input: {
    agentId: string;

    requestedBy: string;

    startRow?: number;
    endRow?: number;
  }
): Promise<object> {
  const agentId =
    s(
      input?.agentId
    );

  const requestedBy =
    s(
      input?.requestedBy
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (!requestedBy) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  await assertCanManageAgent({
    requestedBy,
    agentId,
  });

  /*
   * קודם בודקים שהסוכן בכלל
   * מחובר ל-Surense.
   */
  const agentConfig =
    await loadSurenseIntegrationConfig(
      agentId
    );

  if (
    !agentConfig.enabled
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Surense integration is disabled for agent"
    );
  }

  /*
   * גם ברמת הסוכן שתי היכולות
   * צריכות להיות פעילות.
   */
  if (
    !agentConfig
      .actions
      .searchCustomers
      .enabled
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Search Customers is disabled for agent"
    );
  }

  if (
    !agentConfig
      .actions
      .createWorkflow
      .enabled
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Create Workflow is disabled for agent"
    );
  }

  /*
   * עכשיו בודקים את החלטת המערכת:
   * Make או Direct API.
   */
  const [
    searchConfig,
    createWorkflowConfig,
  ] =
    await Promise.all([
      getSurenseCapabilityConfig(
        "searchCustomers"
      ),

      getSurenseCapabilityConfig(
        "createWorkflow"
      ),
    ]);

  if (
    !searchConfig.enabled
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Search Customers is disabled system-wide"
    );
  }

  if (
    !createWorkflowConfig.enabled
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Create Workflow is disabled system-wide"
    );
  }

  /*
   * אם Search עדיין מוגדר Make,
   * אנחנו לא מפעילים Direct API.
   *
   * ה-Scenario הקיים ב-Make
   * ממשיך לעבוד בעצמו.
   */
  if (
    searchConfig.provider ===
    "make"
  ) {
    return {
      ok: true,

      executed:
        false,

      provider:
        "make",

      reason:
        "searchCustomers is configured to use Make",
    };
  }

  /*
   * למסלול הישיר שלנו Search + Create
   * צריכים כרגע להיות שניהם API.
   *
   * מצב מעורב עלול לגרום לכך שנמשוך לקוח
   * אבל לא ניצור לו Workflow שמונע
   * משיכה חוזרת.
   */
  if (
    createWorkflowConfig.provider !==
    "api"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Direct customer import requires createWorkflow provider to be API"
    );
  }

  let startRow =
    safeInt(
      input.startRow,
      0
    );

  let endRow =
    safeInt(
      input.endRow,
      50
    );

  if (
    startRow < 0
  ) {
    startRow =
      0;
  }

  if (
    endRow <=
    startRow
  ) {
    endRow =
      startRow +
      50;
  }

  /*
   * מגבלת בטיחות לקריאה ידנית.
   * אפשר להרחיב בהמשך כשנבנה pagination/job.
   */
  if (
    endRow -
      startRow >
    100
  ) {
    endRow =
      startRow +
      100;
  }

  console.info(
    "[runSurenseCustomerImport] Starting direct Surense import",
    {
      agentId,

      requestedBy,

      startRow,
      endRow,

      searchProvider:
        searchConfig.provider,

      createWorkflowProvider:
        createWorkflowConfig.provider,
    }
  );

  const result =
    await importSurenseCustomersDirect({
      agentId,
      startRow,
      endRow,
    });

  console.info(
    "[runSurenseCustomerImport] Direct Surense import completed",
    {
      agentId,

      searched:
        result.searched,

      imported:
        result.imported,
    }
  );

  return {
    ...result,

    executed:
      true,

    providers: {
      searchCustomers:
        searchConfig.provider,

      createWorkflow:
        createWorkflowConfig.provider,
    },
  };
}