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
  executeSurenseDirectRequest,
} from "./shared/surenseDirectClient";

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
      "You may only test Surense for your own agent"
    );
  }
}

export async function runSurenseWorkflowTypesTestImpl(
  input: {
    agentId: string;
    requestedBy: string;
  }
): Promise<object> {
  const agentId =
    s(
      input.agentId
    );

  const requestedBy =
    s(
      input.requestedBy
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

  console.info(
    "[runSurenseWorkflowTypesTest] Starting",
    {
      agentId,
      requestedBy,
    }
  );

  const result =
    await executeSurenseDirectRequest<any>({
      agentId,

      path:
        "/workflows/types",

      method:
        "GET",

      scopes: [
        "workflows:read",
      ],
    });

  console.info(
    "[runSurenseWorkflowTypesTest] Completed",
    {
      agentId,

      httpStatus:
        result.httpStatus,
    }
  );

  return {
    ok: true,

    executed:
      true,

    capability:
      "workflowTypesTest",

    provider:
      "api",

    httpStatus:
      result.httpStatus,

    response:
      result.response,
  };
}