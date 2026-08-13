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
} from "./shared/admin";

import {
  loadSurenseIntegrationConfig,
} from "./shared/surenseIntegrationConfig";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function valid(
  value: string
): boolean {
  if (!value) {
    return true;
  }

  try {
    const url =
      new URL(
        value
      );

    return (
      url.protocol ===
        "https:" &&
      Boolean(
        url.hostname
      )
    );
  } catch {
    return false;
  }
}

function normalizeAction(
  value: any
) {
  return {
    enabled:
      Boolean(
        value?.enabled
      ),

    webhookUrl:
      s(
        value?.webhookUrl
      ),
  };
}

function normalizeWorkflowDefaults(
  value: any
) {
  return {
    typeId:
      s(
        value?.typeId
      ),

    ownerId:
      s(
        value?.ownerId
      ),

    assignedUserId:
      s(
        value?.assignedUserId
      ),
  };
}

export async function getAgentSurenseConfigImpl(
  input: {
    agentId: string;
  }
) {
  const agentId =
    s(
      input?.agentId
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  return {
    ok: true,

    agentId,

    config:
      await loadSurenseIntegrationConfig(
        agentId
      ),
  };
}

export async function saveAgentSurenseConfigImpl(
  input: {
    agentId: string;
    config: any;
    updatedBy?: string | null;
  }
) {
  const agentId =
    s(
      input?.agentId
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const config =
    input?.config ||
    {};

  const normalized = {
    enabled:
      Boolean(
        config?.enabled
      ),

    actions: {
      searchCustomers:
        normalizeAction(
          config
            ?.actions
            ?.searchCustomers
        ),

      createWorkflow:
        normalizeAction(
          config
            ?.actions
            ?.createWorkflow
        ),

      updateWorkflow:
        normalizeAction(
          config
            ?.actions
            ?.updateWorkflow
        ),

      closeWorkflow:
        normalizeAction(
          config
            ?.actions
            ?.closeWorkflow
        ),

      createPowerOfAttorney:
        normalizeAction(
          config
            ?.actions
            ?.createPowerOfAttorney
        ),

      getCustomer:
        normalizeAction(
          config
            ?.actions
            ?.getCustomer
        ),
    },

    workflowDefaults:
      normalizeWorkflowDefaults(
        config
          ?.workflowDefaults
      ),

    updatedAt:
      FieldValue
        .serverTimestamp(),

    updatedBy:
      s(
        input?.updatedBy
      ) ||
      null,
  };

  for (
    const [
      key,
      action,
    ] of Object.entries(
      normalized.actions
    )
  ) {
    if (
      !valid(
        action.webhookUrl
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid webhook URL for ${key}`
      );
    }
  }

  await (
    adminDb() as any
  )
    .doc(
      `agents/${agentId}/config/main`
    )
    .set(
      {
        integrations: {
          surense:
            normalized,
        },

        surenseActivityWebhookUrl:
          normalized
            .actions
            .closeWorkflow
            .webhookUrl,
      },
      {
        merge: true,
      }
    );

  return {
    ok: true,
    agentId,
    config:
      normalized,
  };
}