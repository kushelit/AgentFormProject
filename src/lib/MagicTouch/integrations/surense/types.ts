export type SurenseActionConfig={enabled:boolean;webhookUrl:string};
export type SurenseIntegrationConfig={enabled:boolean;actions:{closeWorkflow:SurenseActionConfig;createPowerOfAttorney:SurenseActionConfig;getCustomer:SurenseActionConfig};updatedAt?:unknown;updatedBy?:string|null};
export type GetAgentSurenseConfigResponse={ok:boolean;agentId:string;config:SurenseIntegrationConfig};
export type SaveAgentSurenseConfigResponse=GetAgentSurenseConfigResponse;
