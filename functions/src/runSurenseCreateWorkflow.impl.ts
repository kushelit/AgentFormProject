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
  createSurenseWorkflow,
} from "./shared/createSurenseWorkflow";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
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
    requester?.isSystem ===
    true;

  const isAdmin =
    requester?.role ===
    "admin";

  const loggedInAgentId =
    s(
      requester?.agentId ||
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
      "You may only create Surense workflow for your own agent"
    );
  }
}

export async function runSurenseCreateWorkflowImpl(
  input: {
    agentId: string;
    customerId: string;
    requestedBy: string;
  }
): Promise<object> {
  const agentId =
    s(
      input?.agentId
    );

  const customerId =
    s(
      input?.customerId
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

  if (!customerId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Surense customerId"
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
   * בדיקה עצמאית לחלוטין
   * של Create Workflow.
   *
   * אין כאן תלות ב-Search Customers.
   */
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

  const capabilityConfig =
    await getSurenseCapabilityConfig(
      "createWorkflow"
    );

  if (
    !capabilityConfig.enabled
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Create Workflow is disabled system-wide"
    );
  }

  if (
    capabilityConfig.provider ===
    "make"
  ) {
    return {
      ok: true,

      executed:
        false,

      provider:
        "make",

      capability:
        "createWorkflow",

      reason:
        "createWorkflow is configured to use Make",
    };
  }

  if (
    capabilityConfig.provider !==
    "api"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Unsupported Create Workflow provider"
    );
  }

  console.info(
    "[runSurenseCreateWorkflow] Starting",
    {
      agentId,
      customerId,
      requestedBy,
    }
  );

  const result =
    await createSurenseWorkflow({
      agentId,
      customerId,
    });

  console.info(
    "[runSurenseCreateWorkflow] Completed",
    {
      agentId,
      customerId,

      workflowId:
        result.workflowId,
    }
  );

  return {
    ...result,

    executed:
      true,

    provider:
      "api",

    capability:
      "createWorkflow",

    customerId,
  };
}