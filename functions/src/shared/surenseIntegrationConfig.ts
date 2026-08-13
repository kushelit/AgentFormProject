/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  adminDb,
} from "./admin";

import type {
  SurenseActionConfig,
  SurenseActionKey,
  SurenseIntegrationConfig,
  SurenseWorkflowDefaults,
} from "./surenseIntegrationTypes";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeAction(
  value: any
): SurenseActionConfig {
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
): SurenseWorkflowDefaults {
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

export function emptySurenseIntegrationConfig():
SurenseIntegrationConfig {
  return {
    enabled: false,

    actions: {
      searchCustomers: {
        enabled: false,
        webhookUrl: "",
      },

      createWorkflow: {
        enabled: false,
        webhookUrl: "",
      },

      updateWorkflow: {
        enabled: false,
        webhookUrl: "",
      },

      closeWorkflow: {
        enabled: false,
        webhookUrl: "",
      },

      createPowerOfAttorney: {
        enabled: false,
        webhookUrl: "",
      },

      getCustomer: {
        enabled: false,
        webhookUrl: "",
      },
    },

    workflowDefaults: {
      typeId: "",
      ownerId: "",
      assignedUserId: "",
    },
  };
}

export async function loadSurenseIntegrationConfig(
  agentId: string
): Promise<SurenseIntegrationConfig> {
  const snap =
    await (
      adminDb() as any
    )
      .doc(
        `agents/${agentId}/config/main`
      )
      .get();

  if (!snap.exists) {
    return emptySurenseIntegrationConfig();
  }

  const data =
    snap.data() as any;

  const current =
    data
      ?.integrations
      ?.surense;

  const legacyCloseWorkflowUrl =
    s(
      data
        ?.surenseActivityWebhookUrl
    );

  const closeWorkflow =
    normalizeAction(
      current
        ?.actions
        ?.closeWorkflow
    );

  if (
    !closeWorkflow.webhookUrl &&
    legacyCloseWorkflowUrl
  ) {
    closeWorkflow.webhookUrl =
      legacyCloseWorkflowUrl;

    closeWorkflow.enabled =
      true;
  }

  return {
    enabled:
      Boolean(
        current?.enabled
      ) ||
      Boolean(
        legacyCloseWorkflowUrl
      ),

    actions: {
      searchCustomers:
        normalizeAction(
          current
            ?.actions
            ?.searchCustomers
        ),

      createWorkflow:
        normalizeAction(
          current
            ?.actions
            ?.createWorkflow
        ),

      updateWorkflow:
        normalizeAction(
          current
            ?.actions
            ?.updateWorkflow
        ),

      closeWorkflow,

      createPowerOfAttorney:
        normalizeAction(
          current
            ?.actions
            ?.createPowerOfAttorney
        ),

      getCustomer:
        normalizeAction(
          current
            ?.actions
            ?.getCustomer
        ),
    },

    workflowDefaults:
      normalizeWorkflowDefaults(
        current
          ?.workflowDefaults
      ),

    updatedAt:
      current?.updatedAt,

    updatedBy:
      s(
        current?.updatedBy
      ) ||
      null,
  };
}

export async function getSurenseActionConfig(
  agentId: string,
  action: SurenseActionKey
): Promise<SurenseActionConfig> {
  const config =
    await loadSurenseIntegrationConfig(
      agentId
    );

  return config
    .actions[action];
}