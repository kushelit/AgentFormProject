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

  if (
    !requesterSnap.exists
  ) {
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
   * בודקים שהסוכן מחובר בכלל
   * לאינטגרציית Surense.
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
   * הפעולה הזו היא Search/Import בלבד.
   *
   * אין כאן שום תלות ב-createWorkflow.
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

  /*
   * בודקים רק את capability
   * של Search Customers ברמת המערכת.
   */
  const searchConfig =
    await getSurenseCapabilityConfig(
      "searchCustomers"
    );

  if (
    !searchConfig.enabled
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Search Customers is disabled system-wide"
    );
  }

  /*
   * אם Search Customers עדיין מופעל
   * דרך Make, לא מריצים Direct API.
   *
   * ה-Scenario הקיים יכול להמשיך
   * לפעול בנפרד.
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

      capability:
        "searchCustomers",

      reason:
        "searchCustomers is configured to use Make",
    };
  }

  /*
   * נכון לעכשיו קיימים שני providers:
   * make / api.
   *
   * מוסיפים guard מפורש כדי שלא נריץ
   * Direct API במקרה של ערך לא צפוי.
   */
  if (
    searchConfig.provider !==
    "api"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Unsupported Search Customers provider"
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
   * מגבלת בטיחות להרצה ידנית.
   *
   * בהמשך, כאשר נבנה job/pagination
   * מסודר, אפשר יהיה לטפל בכמויות
   * גדולות יותר בצורה מבוקרת.
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
    "[runSurenseCustomerImport] Starting direct Surense customer import",
    {
      agentId,

      requestedBy,

      startRow,
      endRow,

      searchProvider:
        searchConfig.provider,
    }
  );

  /*
   * importSurenseCustomersDirect מבצע:
   *
   * Search Customers
   *       ↓
   * Upsert MagicTouch Contact
   *
   * ולא יוצר Workflow ב-Surense.
   */
  const result =
    await importSurenseCustomersDirect({
      agentId,
      startRow,
      endRow,
    });

  console.info(
    "[runSurenseCustomerImport] Direct Surense customer import completed",
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

    capability:
      "searchCustomers",

    provider:
      searchConfig.provider,
  };
}