/* eslint-disable @typescript-eslint/no-explicit-any */
export type SurenseActionKey = "closeWorkflow" | "createPowerOfAttorney" | "getCustomer";
export type SurenseActionConfig = { enabled: boolean; webhookUrl: string; };
export type SurenseIntegrationConfig = {
  enabled: boolean;
  actions: Record<SurenseActionKey, SurenseActionConfig>;
  updatedAt?: any;
  updatedBy?: string | null;
};
