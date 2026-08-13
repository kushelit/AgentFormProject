/* eslint-disable @typescript-eslint/no-explicit-any */

export type SurenseActionKey =
  | "closeWorkflow"
  | "createPowerOfAttorney"
  | "getCustomer";

export type SurenseCapabilityKey =
  | "searchCustomers"
  | "createWorkflow"
  | "updateWorkflow"
  | "closeWorkflow"
  | "createPowerOfAttorney"
  | "getCustomer";

export type SurenseActionConfig = {
  enabled: boolean;
  webhookUrl: string;
};

export type SurenseWorkflowDefaults = {
  typeId: string;
  ownerId: string;
  assignedUserId: string;
};

export type SurenseIntegrationConfig = {
  enabled: boolean;

  actions: Record<
    SurenseCapabilityKey,
    SurenseActionConfig
  >;

  workflowDefaults: SurenseWorkflowDefaults;

  updatedAt?: any;
  updatedBy?: string | null;
};